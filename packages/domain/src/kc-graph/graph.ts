import type { Kc, KcEdge, KcId } from '../types.js';

/**
 * The prerequisite DAG over knowledge components.
 *
 * Edges cross course boundaries on purpose: `math2472.integration-by-parts ->
 * ee2300.rc-step-response` is the edge that explains why a Circuits II student
 * is actually stuck on Calculus II. A per-course graph cannot represent that,
 * and so cannot diagnose it.
 */

export interface GraphNeighbour {
  kcId: KcId;
  /** Shortest path length in edges. */
  distance: number;
  /** Product of edge strengths along the path used. */
  strength: number;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export class KcGraph {
  readonly kcs: ReadonlyMap<KcId, Kc>;
  private readonly outgoing = new Map<KcId, KcEdge[]>(); // prereq -> dependents
  private readonly incoming = new Map<KcId, KcEdge[]>(); // dependent -> prereqs

  constructor(kcs: readonly Kc[], edges: readonly KcEdge[]) {
    const byId = new Map<KcId, Kc>();
    for (const kc of kcs) {
      if (byId.has(kc.id)) throw new Error(`KcGraph: duplicate KC id "${kc.id}"`);
      byId.set(kc.id, kc);
    }
    this.kcs = byId;

    for (const e of edges) {
      if (!byId.has(e.from)) throw new Error(`KcGraph: edge references unknown KC "${e.from}"`);
      if (!byId.has(e.to)) throw new Error(`KcGraph: edge references unknown KC "${e.to}"`);
      if (e.from === e.to) throw new Error(`KcGraph: self-loop on "${e.from}"`);
      push(this.outgoing, e.from, e);
      push(this.incoming, e.to, e);
    }

    const cycle = this.findCycle();
    if (cycle) throw new Error(`KcGraph: prerequisite cycle detected: ${cycle.join(' -> ')}`);
  }

  has(id: KcId): boolean {
    return this.kcs.has(id);
  }

  get size(): number {
    return this.kcs.size;
  }

  /** Direct prerequisites of `id`. */
  prerequisites(id: KcId): KcEdge[] {
    return this.incoming.get(id) ?? [];
  }

  /** Direct dependents of `id`. */
  dependents(id: KcId): KcEdge[] {
    return this.outgoing.get(id) ?? [];
  }

  /** Returns a cycle as a node list if one exists, else null. */
  private findCycle(): KcId[] | null {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const colour = new Map<KcId, number>();
    const stack: KcId[] = [];

    const visit = (id: KcId): KcId[] | null => {
      colour.set(id, GREY);
      stack.push(id);
      for (const e of this.outgoing.get(id) ?? []) {
        const c = colour.get(e.to) ?? WHITE;
        if (c === GREY) return [...stack.slice(stack.indexOf(e.to)), e.to];
        if (c === WHITE) {
          const found = visit(e.to);
          if (found) return found;
        }
      }
      stack.pop();
      colour.set(id, BLACK);
      return null;
    };

    for (const id of this.kcs.keys()) {
      if ((colour.get(id) ?? WHITE) === WHITE) {
        const found = visit(id);
        if (found) return found;
      }
    }
    return null;
  }

  /** Prerequisites first. Deterministic: ties break on KC id. */
  topoSort(): KcId[] {
    const indegree = new Map<KcId, number>();
    for (const id of this.kcs.keys()) indegree.set(id, this.prerequisites(id).length);

    const ready = [...indegree].filter(([, d]) => d === 0).map(([id]) => id).sort();
    const order: KcId[] = [];

    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      const unlocked: KcId[] = [];
      for (const e of this.dependents(id)) {
        const d = (indegree.get(e.to) ?? 1) - 1;
        indegree.set(e.to, d);
        if (d === 0) unlocked.push(e.to);
      }
      if (unlocked.length > 0) {
        ready.push(...unlocked.sort());
        ready.sort();
      }
    }
    return order;
  }

  /**
   * Breadth-first traversal recording shortest distance and accumulated edge
   * strength. `direction: 'up'` walks toward prerequisites, `'down'` toward
   * dependents.
   */
  private traverse(start: KcId, direction: 'up' | 'down', maxDepth: number): GraphNeighbour[] {
    if (!this.has(start)) throw new Error(`KcGraph: unknown KC "${start}"`);

    const best = new Map<KcId, GraphNeighbour>();
    let frontier: GraphNeighbour[] = [{ kcId: start, distance: 0, strength: 1 }];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const next: GraphNeighbour[] = [];
      for (const node of frontier) {
        const edges = direction === 'up' ? this.prerequisites(node.kcId) : this.dependents(node.kcId);
        for (const e of edges) {
          const target = direction === 'up' ? e.from : e.to;
          if (target === start) continue;
          const candidate: GraphNeighbour = {
            kcId: target,
            distance: depth,
            strength: node.strength * e.strength,
          };
          const existing = best.get(target);
          // Shortest path wins outright; only among equal-length paths does the
          // stronger one win. Letting strength override distance would let a
          // long chain of strong edges masquerade as a close relationship.
          const better =
            !existing ||
            candidate.distance < existing.distance ||
            (candidate.distance === existing.distance && candidate.strength > existing.strength);
          if (better) {
            best.set(target, candidate);
            next.push(candidate);
          }
        }
      }
      frontier = next;
    }

    return [...best.values()].sort((a, b) => a.distance - b.distance || a.kcId.localeCompare(b.kcId));
  }

  /** Transitive prerequisites, nearest first. */
  ancestors(id: KcId, maxDepth = 8): GraphNeighbour[] {
    return this.traverse(id, 'up', maxDepth);
  }

  /** Transitive dependents, nearest first. */
  descendants(id: KcId, maxDepth = 8): GraphNeighbour[] {
    return this.traverse(id, 'down', maxDepth);
  }

  /** KCs with no prerequisites — the natural entry points for a placement exam. */
  roots(): KcId[] {
    return [...this.kcs.keys()].filter((id) => this.prerequisites(id).length === 0).sort();
  }

  /**
   * The learning frontier: KCs not yet mastered whose prerequisites all are.
   * This is what "available" means on the skill tree, and what the daily quest
   * draws new material from.
   */
  frontier(isMastered: (id: KcId) => boolean): KcId[] {
    return [...this.kcs.keys()]
      .filter((id) => !isMastered(id) && this.prerequisites(id).every((e) => isMastered(e.from)))
      .sort();
  }

  /** Assign each KC a depth layer for skill-tree layout. */
  layers(): Map<KcId, number> {
    const depth = new Map<KcId, number>();
    for (const id of this.topoSort()) {
      const prereqs = this.prerequisites(id);
      depth.set(id, prereqs.length === 0 ? 0 : Math.max(...prereqs.map((e) => (depth.get(e.from) ?? 0) + 1)));
    }
    return depth;
  }

  subgraphForCourses(courseIds: readonly string[]): KcGraph {
    const wanted = new Set(courseIds);
    const kcs = [...this.kcs.values()].filter((k) => wanted.has(k.courseId));
    const ids = new Set(kcs.map((k) => k.id));
    const edges: KcEdge[] = [];
    for (const id of ids) for (const e of this.prerequisites(id)) if (ids.has(e.from)) edges.push(e);
    return new KcGraph(kcs, edges);
  }
}
