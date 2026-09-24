import { describe, expect, it } from 'vitest';
import { toNetlist, type Schematic } from '@et/circuits';
import type { Figure } from '@et/content-schema';
import { GENERATORS, gradeFigure, makeRng } from '../src/index.js';

/**
 * Every figure must be the circuit the item is about.
 *
 * A generator draws a figure from the same parameters that produce the answer,
 * so the *values* agree by construction. The geometry does not: a figure can be
 * wired into a different circuit entirely and nothing downstream would notice,
 * because the answer key is still right and the picture still looks like a
 * circuit. So the drawing is turned back into a netlist and solved, and its
 * declared measurements are checked against what the solver says.
 */

/**
 * `Figure` is declared structurally in `@et/content-schema` so the contract does
 * not depend on a domain package. This is the assignment that pins the two
 * together: if `Schematic` gains a required field or changes a type, this stops
 * compiling instead of failing at runtime somewhere in the renderer.
 */
const asSchematic = (f: Figure): Schematic => f satisfies Schematic;

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

const withFigures = GENERATORS.filter((g) => g.generate(makeRng(1), 1).figure !== undefined);

describe('circuit figures', () => {
  it('exist for the topology-heavy generators', () => {
    expect(withFigures.length).toBeGreaterThan(0);
  });

  for (const g of withFigures) {
    it(`${g.id}: the drawing is a complete, solvable circuit`, () => {
      for (const seed of SEEDS) {
        const generated = g.generate(makeRng(seed), seed);
        const fig = generated.figure;
        expect(fig, `${g.id} stopped emitting a figure at seed ${seed}`).toBeDefined();
        const built = toNetlist(asSchematic(fig!));
        expect(
          built.issues.map((i) => `${i.componentId ?? '-'}: ${i.message}`),
          `${g.id} seed ${seed}`,
        ).toEqual([]);
      }
    });

    it(`${g.id}: simulating the drawing reproduces the item's own numbers`, () => {
      for (const seed of SEEDS) {
        const fig = g.generate(makeRng(seed), seed).figure!;
        if (fig.expects.length === 0) continue;
        const result = gradeFigure(fig);
        const detail = result.results
          .filter((r) => !r.within)
          .map((r) => `${r.probe} expected ${r.expected} got ${r.actual ?? 'nothing'}`)
          .join('; ');
        expect(result.error ?? detail, `${g.id} seed ${seed}`).toBe('');
        expect(result.correct, `${g.id} seed ${seed}`).toBe(true);
      }
    });
  }
});
