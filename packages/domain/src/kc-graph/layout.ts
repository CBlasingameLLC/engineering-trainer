import type { KcGraph } from './graph.js';
import type { KcMastery } from '../mastery/composite.js';
import type { KcId } from '../types.js';

/**
 * Skill-tree layout.
 *
 * The board is the real prerequisite DAG, not a decorative map drawn to look
 * like one. That constraint is the whole value: a node sits above another
 * because it genuinely depends on it, so "what do I need before this" is
 * answered by looking up, and a locked node is locked for a reason the learner
 * can trace.
 *
 * Layered layout with barycentre ordering — a cut-down Sugiyama. elkjs would do
 * this more thoroughly, but it is a large dependency for a graph of a few dozen
 * nodes whose layering is already fixed by the prerequisite depth.
 */

export type SkillState = 'locked' | 'available' | 'learning' | 'proficient' | 'mastered';

export interface LayoutNode {
  kcId: KcId;
  /** Prerequisite depth: 0 has no prerequisites. */
  layer: number;
  /** Position within the layer, left to right. */
  order: number;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: KcId;
  to: KcId;
  strength: number;
  /** True when the prerequisite lives in a different course. */
  crossCourse: boolean;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  /** KC ids per layer, in draw order. */
  layers: KcId[][];
}

export interface LayoutOptions {
  /** Horizontal spacing between node centres. */
  columnGap?: number;
  /** Vertical spacing between layers. */
  rowGap?: number;
  /** Barycentre ordering sweeps. Four is well past the point of diminishing returns here. */
  sweeps?: number;
}

export function layoutGraph(graph: KcGraph, options: LayoutOptions = {}): GraphLayout {
  const columnGap = options.columnGap ?? 180;
  const rowGap = options.rowGap ?? 120;
  const sweeps = options.sweeps ?? 4;

  const depth = graph.layers();
  const layers: KcId[][] = [];
  for (const [kcId, layer] of depth) {
    (layers[layer] ??= []).push(kcId);
  }
  for (const layer of layers) layer.sort((a, b) => a.localeCompare(b));

  // Barycentre sweeps: order each layer by the average position of the nodes it
  // connects to in the layer above, which pulls connected nodes into alignment
  // and removes most crossings without a full crossing-minimisation pass.
  const positionIn = (layerIndex: number, kcId: KcId): number => {
    const index = layers[layerIndex]?.indexOf(kcId) ?? -1;
    return index < 0 ? 0 : index;
  };

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const downward = sweep % 2 === 0;
    const order = downward
      ? layers.map((_, i) => i).slice(1)
      : layers.map((_, i) => i).slice(0, -1).reverse();

    for (const layerIndex of order) {
      const layer = layers[layerIndex];
      if (!layer || layer.length < 2) continue;
      const neighbourLayer = downward ? layerIndex - 1 : layerIndex + 1;

      const barycentre = new Map<KcId, number>();
      for (const kcId of layer) {
        const neighbours = downward
          ? graph.prerequisites(kcId).map((e) => e.from)
          : graph.dependents(kcId).map((e) => e.to);
        const inNeighbourLayer = neighbours.filter((n) => (depth.get(n) ?? -1) === neighbourLayer);
        if (inNeighbourLayer.length === 0) {
          barycentre.set(kcId, positionIn(layerIndex, kcId));
        } else {
          const mean =
            inNeighbourLayer.reduce((sum, n) => sum + positionIn(neighbourLayer, n), 0) /
            inNeighbourLayer.length;
          barycentre.set(kcId, mean);
        }
      }

      // Ties break on id so the layout is deterministic — a skill tree that
      // reshuffles between renders is unusable as a mental map.
      layer.sort(
        (a, b) => (barycentre.get(a) ?? 0) - (barycentre.get(b) ?? 0) || a.localeCompare(b),
      );
    }
  }

  const widest = Math.max(1, ...layers.map((l) => l?.length ?? 0));
  const width = widest * columnGap;

  const nodes: LayoutNode[] = [];
  layers.forEach((layer, layerIndex) => {
    if (!layer) return;
    // Centre each layer against the widest one, so the tree reads as a tree
    // rather than as left-aligned columns.
    const offset = (width - layer.length * columnGap) / 2;
    layer.forEach((kcId, order) => {
      nodes.push({
        kcId,
        layer: layerIndex,
        order,
        x: offset + order * columnGap + columnGap / 2,
        y: layerIndex * rowGap + rowGap / 2,
      });
    });
  });

  const edges: LayoutEdge[] = [];
  for (const kcId of graph.kcs.keys()) {
    for (const edge of graph.prerequisites(kcId)) {
      const fromCourse = graph.kcs.get(edge.from)?.courseId;
      const toCourse = graph.kcs.get(edge.to)?.courseId;
      edges.push({
        from: edge.from,
        to: edge.to,
        strength: edge.strength,
        crossCourse: fromCourse !== undefined && toCourse !== undefined && fromCourse !== toCourse,
      });
    }
  }

  return {
    nodes,
    edges,
    width,
    height: layers.length * rowGap,
    layers: layers.map((l) => l ?? []),
  };
}

const PROFICIENT = 0.65;
const MASTERED = 0.85;
const UNLOCK = 0.65;

/**
 * Node state for every KC.
 *
 * `locked` is the one that carries information: it means a prerequisite is not
 * in place, so attempting this KC now would produce a failure that says nothing
 * about the KC itself. Everything else is a mastery band.
 */
export function skillStates(
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, KcMastery>,
): Map<KcId, SkillState> {
  const states = new Map<KcId, SkillState>();

  for (const kcId of graph.kcs.keys()) {
    const m = mastery.get(kcId);
    const composite = m?.composite ?? 0;

    if (composite >= MASTERED) {
      states.set(kcId, 'mastered');
      continue;
    }
    if (composite >= PROFICIENT) {
      states.set(kcId, 'proficient');
      continue;
    }

    const prerequisitesMet = graph
      .prerequisites(kcId)
      .every((e) => (mastery.get(e.from)?.composite ?? 0) >= UNLOCK);

    if (!prerequisitesMet) {
      states.set(kcId, 'locked');
      continue;
    }
    states.set(kcId, (m?.attempts ?? 0) > 0 ? 'learning' : 'available');
  }

  return states;
}

/** Prerequisites of `kcId` that are not yet strong enough — why it is locked. */
export const blockingPrerequisites = (
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, KcMastery>,
  kcId: KcId,
): KcId[] =>
  graph
    .prerequisites(kcId)
    .filter((e) => (mastery.get(e.from)?.composite ?? 0) < UNLOCK)
    .map((e) => e.from);
