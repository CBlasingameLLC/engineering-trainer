import { describe, expect, it } from 'vitest';
import { KcGraph } from '../src/kc-graph/graph.js';
import type { Kc, KcEdge } from '../src/types.js';

const kc = (id: string, courseId = 'EE2300'): Kc => ({
  id, courseId, title: id, unit: 'u', domain: 'circuits',
  competencies: ['math-execution'], difficultyPrior: 0,
});

const edge = (from: string, to: string, strength = 1): KcEdge => ({ from, to, strength });

/**
 * ohm -> kcl -> nodal -> supernode
 *          \--> mesh
 * Mirrors the real shape: several techniques resting on shared foundations.
 */
const chain = () =>
  new KcGraph(
    ['ohm', 'kcl', 'nodal', 'supernode', 'mesh'].map((id) => kc(id)),
    [edge('ohm', 'kcl'), edge('kcl', 'nodal'), edge('nodal', 'supernode'), edge('kcl', 'mesh')],
  );

describe('construction', () => {
  it('rejects duplicate KC ids', () => {
    expect(() => new KcGraph([kc('a'), kc('a')], [])).toThrow(/duplicate KC id/);
  });

  it('rejects edges referencing unknown KCs', () => {
    expect(() => new KcGraph([kc('a')], [edge('a', 'ghost')])).toThrow(/unknown KC "ghost"/);
    expect(() => new KcGraph([kc('a')], [edge('ghost', 'a')])).toThrow(/unknown KC "ghost"/);
  });

  it('rejects self-loops', () => {
    expect(() => new KcGraph([kc('a')], [edge('a', 'a')])).toThrow(/self-loop/);
  });

  it('rejects prerequisite cycles and names the cycle', () => {
    // A cycle means "you must know A before B, and B before A" — unsatisfiable,
    // and it would make topological ordering and propagation loop forever.
    expect(
      () => new KcGraph([kc('a'), kc('b'), kc('c')], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]),
    ).toThrow(/cycle detected/);
  });

  it('accepts a diamond, which is not a cycle', () => {
    expect(
      () =>
        new KcGraph(
          [kc('a'), kc('b'), kc('c'), kc('d')],
          [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
        ),
    ).not.toThrow();
  });
});

describe('topoSort', () => {
  it('places every prerequisite before its dependents', () => {
    const g = chain();
    const order = g.topoSort();
    expect(order).toHaveLength(5);
    const pos = new Map(order.map((id, i) => [id, i]));
    for (const id of order) {
      for (const e of g.prerequisites(id)) {
        expect(pos.get(e.from)!).toBeLessThan(pos.get(id)!);
      }
    }
  });

  it('is deterministic across runs', () => {
    expect(chain().topoSort()).toEqual(chain().topoSort());
  });
});

describe('ancestors and descendants', () => {
  it('walks the full transitive prerequisite closure with distances', () => {
    const anc = new Map(chain().ancestors('supernode').map((a) => [a.kcId, a.distance]));
    expect(anc.get('nodal')).toBe(1);
    expect(anc.get('kcl')).toBe(2);
    expect(anc.get('ohm')).toBe(3);
    expect(anc.has('mesh')).toBe(false); // a sibling, not a prerequisite
  });

  it('walks the transitive dependent closure', () => {
    const desc = new Map(chain().descendants('ohm').map((d) => [d.kcId, d.distance]));
    expect(desc.get('kcl')).toBe(1);
    expect(desc.get('nodal')).toBe(2);
    expect(desc.get('mesh')).toBe(2);
    expect(desc.get('supernode')).toBe(3);
  });

  it('accumulates edge strength along the path', () => {
    const g = new KcGraph(
      [kc('a'), kc('b'), kc('c')],
      [edge('a', 'b', 0.5), edge('b', 'c', 0.5)],
    );
    const a = g.ancestors('c').find((x) => x.kcId === 'a')!;
    expect(a.strength).toBeCloseTo(0.25, 12);
  });

  it('prefers the shortest path even when a longer one is stronger', () => {
    // short: a -> c with strength 0.2 (distance 1)
    // long:  a -> b -> c with strength 1.0 (distance 2)
    const g = new KcGraph(
      [kc('a'), kc('b'), kc('c')],
      [edge('a', 'c', 0.2), edge('a', 'b', 1), edge('b', 'c', 1)],
    );
    const a = g.ancestors('c').find((x) => x.kcId === 'a')!;
    expect(a.distance).toBe(1);
  });

  it('respects the depth limit', () => {
    expect(chain().ancestors('supernode', 1).map((a) => a.kcId)).toEqual(['nodal']);
  });

  it('terminates on a diamond without revisiting nodes', () => {
    const g = new KcGraph(
      [kc('a'), kc('b'), kc('c'), kc('d')],
      [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    );
    const anc = g.ancestors('d');
    expect(anc.map((x) => x.kcId).sort()).toEqual(['a', 'b', 'c']);
    expect(anc.filter((x) => x.kcId === 'a')).toHaveLength(1);
  });

  it('throws for an unknown start node', () => {
    expect(() => chain().ancestors('ghost')).toThrow(/unknown KC/);
  });
});

describe('roots, frontier and layers', () => {
  it('identifies KCs with no prerequisites', () => {
    expect(chain().roots()).toEqual(['ohm']);
  });

  it('reports only KCs whose prerequisites are all mastered', () => {
    const g = chain();
    expect(g.frontier(() => false)).toEqual(['ohm']);
    expect(g.frontier((id) => id === 'ohm')).toEqual(['kcl']);
    expect(g.frontier((id) => ['ohm', 'kcl'].includes(id))).toEqual(['mesh', 'nodal']);
  });

  it('assigns layers by longest path from a root', () => {
    const layers = chain().layers();
    expect(layers.get('ohm')).toBe(0);
    expect(layers.get('kcl')).toBe(1);
    expect(layers.get('nodal')).toBe(2);
    expect(layers.get('mesh')).toBe(2);
    expect(layers.get('supernode')).toBe(3);
  });
});

describe('subgraphForCourses', () => {
  it('keeps only in-course KCs and the edges between them', () => {
    const g = new KcGraph(
      [kc('calc.ibp', 'MATH2472'), kc('ee.rc', 'EE2300'), kc('ee.ohm', 'EE2300')],
      [edge('calc.ibp', 'ee.rc'), edge('ee.ohm', 'ee.rc')],
    );
    const sub = g.subgraphForCourses(['EE2300']);
    expect(sub.size).toBe(2);
    // The cross-course prerequisite is dropped, so rc becomes a local root.
    expect(sub.prerequisites('ee.rc').map((e) => e.from)).toEqual(['ee.ohm']);
  });
});
