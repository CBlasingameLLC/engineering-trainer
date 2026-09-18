import type { KcGraph } from '../kc-graph/graph.js';
import type { KcId } from '../types.js';

/**
 * Prerequisite inference over the DAG.
 *
 * This is the multiplier that makes broad placement affordable. Solving a
 * supermesh problem is strong evidence for KCL, Ohm's law and series/parallel
 * reduction — you cannot do the former without the latter. Spending items to
 * re-establish that is wasted budget. Propagation converts one confident
 * observation into calibrated priors across that KC's whole ancestry, which is
 * how ~45 items cover a course instead of ~250.
 */

export interface PropagationParams {
  /** Per-hop decay of inferred evidence. Lower = more conservative. */
  gamma: number;
  /**
   * Below this standard error, a result carries enough information to
   * propagate. Deliberately loose — see `minObservations`.
   *
   * A tight bound here does not work. Standard error falls as 2/sqrt(n) for
   * optimally targeted items, so SE 0.35 demands ~33 items on a single KC.
   * Across a 24-KC course that is ~790 items, and a placement exam that never
   * reaches the bar would never propagate anything. This threshold's real job
   * is to exclude near-zero-information responses; `minObservations` and the
   * mastery thresholds do the actual gatekeeping.
   */
  confidenceSe: number;
  /**
   * Minimum direct observations before a KC may be propagated from.
   *
   * This is load-bearing. BKT moves fast: from the 0.15 prior, a single correct
   * free-response answer lands at 0.79 — already past `successThreshold`.
   * Without this floor one lucky answer would rewrite priors across an entire
   * prerequisite ancestry.
   */
  minObservations: number;
  /** Mastery at or above this propagates upward to prerequisites. */
  successThreshold: number;
  /** Mastery at or below this propagates downward to dependents. */
  failureThreshold: number;
  maxDepth: number;
}

export const DEFAULT_PROPAGATION: PropagationParams = {
  gamma: 0.85,
  confidenceSe: 1.6,
  minObservations: 2,
  successThreshold: 0.75,
  failureThreshold: 0.3,
  maxDepth: 4,
};

export interface ObservedResult {
  kcId: KcId;
  /** Composite or BKT mastery in [0,1]. */
  mastery: number;
  standardError: number;
  /** Direct responses backing this result. */
  observations: number;
}

export interface PriorAdjustment {
  kcId: KcId;
  prior: number;
  /** Which observed KC drove this, for explaining the gap report. */
  source: KcId;
  direction: 'from-dependent' | 'from-prerequisite';
  distance: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Derive prior adjustments from confidently measured KCs.
 *
 * Upward (success): mastering a KC implies at least `gamma^d * strength *
 * mastery` on each prerequisite. Taken as a lower bound via `max`, so
 * propagation can raise a prior but never lower one that direct evidence
 * supports.
 *
 * Downward (failure): failing a KC bounds its dependents from above. Taken via
 * `min` for the same reason. Both bounds relax to no-op as distance grows,
 * which keeps a single observation from rewriting the whole graph.
 */
export function propagatePriors(
  graph: KcGraph,
  results: readonly ObservedResult[],
  params: PropagationParams = DEFAULT_PROPAGATION,
): Map<KcId, PriorAdjustment> {
  const adjustments = new Map<KcId, PriorAdjustment>();

  const considerUpper = (a: PriorAdjustment): void => {
    const existing = adjustments.get(a.kcId);
    if (!existing || a.prior > existing.prior) adjustments.set(a.kcId, a);
  };
  const considerLower = (a: PriorAdjustment): void => {
    const existing = adjustments.get(a.kcId);
    if (!existing || a.prior < existing.prior) adjustments.set(a.kcId, a);
  };

  for (const result of results) {
    if (result.observations < params.minObservations) continue; // too thin to infer from
    if (result.standardError > params.confidenceSe) continue; // not confident enough
    if (!graph.has(result.kcId)) continue;

    if (result.mastery >= params.successThreshold) {
      for (const anc of graph.ancestors(result.kcId, params.maxDepth)) {
        const decay = Math.pow(params.gamma, anc.distance) * anc.strength;
        considerUpper({
          kcId: anc.kcId,
          prior: clamp01(decay * result.mastery),
          source: result.kcId,
          direction: 'from-dependent',
          distance: anc.distance,
        });
      }
    } else if (result.mastery <= params.failureThreshold) {
      for (const desc of graph.descendants(result.kcId, params.maxDepth)) {
        const decay = Math.pow(params.gamma, desc.distance) * desc.strength;
        // Relaxes toward 1 (no constraint) as the inference gets more remote.
        considerLower({
          kcId: desc.kcId,
          prior: clamp01(result.mastery + (1 - result.mastery) * (1 - decay)),
          source: result.kcId,
          direction: 'from-prerequisite',
          distance: desc.distance,
        });
      }
    }
  }

  // Never overwrite a KC that was measured directly — observation beats inference.
  for (const r of results) adjustments.delete(r.kcId);
  return adjustments;
}

/**
 * Merge inferred priors into a set of directly measured ones. Direct evidence
 * always wins; inference only fills holes.
 */
export function mergePriors(
  measured: ReadonlyMap<KcId, number>,
  inferred: ReadonlyMap<KcId, PriorAdjustment>,
): Map<KcId, number> {
  const merged = new Map(measured);
  for (const [kcId, adj] of inferred) if (!merged.has(kcId)) merged.set(kcId, adj.prior);
  return merged;
}
