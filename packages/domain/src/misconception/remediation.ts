import type { AxisScore } from '../mastery/composite.js';
import type { Competency, KcId, MisconceptionId } from '../types.js';
import type { DrillCandidate } from './drill.js';
import { assembleDrill } from './drill.js';
import type { MisconceptionFamilyRollup } from './family.js';

/**
 * Turning the competency radar into something to do.
 *
 * The radar has been drawn since the dashboard shipped and has never been
 * *read* by anything. That is a real defect rather than a missing nicety,
 * because a competency score on its own cannot be acted on. "Your
 * math-execution is weak across three courses" is true, is unreachable from
 * any gradebook, and still leaves the learner with no next move — there is no
 * such thing as a math-execution exercise.
 *
 * What is actionable is the habit underneath it. The misconception families
 * already carry a `competency`, so the radar can say *which* axis is costing
 * the most and the family can say *what specifically* is going wrong on it,
 * and the drill can then be built from items that are able to catch that
 * error. Each of the three pieces existed; none of them pointed at the next.
 *
 * The ranking multiplies two things:
 *
 * - **How much the habit is costing.** The family rollup's score, which is
 *   already recency-weighted and already amplified by how many courses the
 *   error spans.
 * - **How weak the axis it sits on is**, both outright and relative to this
 *   learner's other axes. The relative half is the radar's actual claim: an
 *   axis 0.2 below someone's own average is their particular weakness, which
 *   is a different statement from a low absolute score and the one the shape
 *   of a radar chart is showing. Relative alone would rank nothing for a
 *   learner who is uniformly weak, so the absolute term carries the floor.
 */

export interface RemediationStep {
  /** 1-based, for display. */
  rank: number;
  competency: Competency;
  /** The axis score this step is anchored to, 0..1. */
  competencyComposite: number;
  /** How far below the learner's own mean competency this axis sits. */
  relativeShortfall: number;
  family: MisconceptionFamilyRollup['family'];
  familyScore: number;
  totalHits: number;
  courses: string[];
  crossCourse: boolean;
  /** The specific error to drill — the family's worst-ranked member. */
  target: MisconceptionId;
  /** Components where this habit is currently costing marks. */
  affectedKcs: KcId[];
  /**
   * Items that can actually detect the target error. Empty means the habit is
   * diagnosed and not yet remediable, which is worth saying rather than
   * offering a drill that cannot test what it claims to.
   */
  drill: DrillCandidate[];
  priority: number;
}

export interface RemediationOptions {
  drillSize?: number;
  attempted?: ReadonlySet<string>;
  /** Learner ability, so drills aim slightly below it. */
  ability?: number;
  limit?: number;
}

/**
 * A competency with no measurement behind it scores neutrally.
 *
 * In practice this is nearly unreachable — a family only appears once its
 * errors have been made, which means items on that axis have been answered —
 * but treating an unmeasured axis as 0 would let it outrank every measured
 * weakness on the strength of knowing nothing about it.
 */
const NEUTRAL_COMPETENCY = 0.5;

export function remediationPlan(
  families: readonly MisconceptionFamilyRollup[],
  competencies: readonly AxisScore<Competency>[],
  candidates: readonly DrillCandidate[],
  options: RemediationOptions = {},
): RemediationStep[] {
  const byKey = new Map<string, AxisScore<Competency>>(competencies.map((c) => [c.key, c]));
  const measured = competencies.filter((c) => c.testedCount > 0);
  const mean =
    measured.length > 0
      ? measured.reduce((sum, c) => sum + c.composite, 0) / measured.length
      : NEUTRAL_COMPETENCY;

  const steps: Omit<RemediationStep, 'rank'>[] = [];

  for (const rollup of families) {
    const competency = rollup.family.competency as Competency;
    const axis = byKey.get(competency);
    const composite = axis && axis.testedCount > 0 ? axis.composite : NEUTRAL_COMPETENCY;
    const relativeShortfall = Math.max(0, mean - composite);

    // Absolute room to improve, amplified when this axis is the learner's own
    // standout weakness. Never zero, so a family always ranks somewhere.
    const lever = (1 - composite) * (1 + relativeShortfall);

    // Drill the family's worst member rather than the family as a whole: a
    // family is a habit and a drill has to be built from items that can catch
    // one specific error, which is a property of a misconception id.
    const target = rollup.members[0];
    if (!target) continue;

    const drill = assembleDrill(target.misconceptionId, candidates, {
      ...(options.drillSize === undefined ? {} : { size: options.drillSize }),
      ...(options.attempted === undefined ? {} : { attempted: options.attempted }),
      ...(options.ability === undefined ? {} : { ability: options.ability }),
    });

    steps.push({
      competency,
      competencyComposite: composite,
      relativeShortfall: Number(relativeShortfall.toFixed(4)),
      family: rollup.family,
      familyScore: rollup.score,
      totalHits: rollup.totalHits,
      courses: rollup.courses,
      crossCourse: rollup.crossCourse,
      target: target.misconceptionId,
      affectedKcs: [...new Set(rollup.members.flatMap((m) => m.kcs))],
      drill,
      priority: Number((rollup.score * lever).toFixed(6)),
    });
  }

  const ranked = steps
    .sort((a, b) => b.priority - a.priority || a.family.id.localeCompare(b.family.id))
    .map((step, i) => ({ ...step, rank: i + 1 }));

  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

export interface CompetencyFinding {
  competency: Competency;
  composite: number;
  testedCount: number;
  kcCount: number;
  /** Families of error that sit on this axis, worst first. */
  families: MisconceptionFamilyRollup[];
  /**
   * True when this axis is measurably below the learner's others. The radar's
   * whole diagnostic claim is comparative, so this is the flag worth reading.
   */
  standoutWeakness: boolean;
}

/**
 * How far below the mean an axis has to sit before it is worth calling out.
 *
 * Small enough to catch a real lean, large enough that ordinary noise across
 * six axes does not produce a finding every session.
 */
const STANDOUT_MARGIN = 0.08;

/** Every competency, joined to the habits recorded against it. */
export function competencyFindings(
  competencies: readonly AxisScore<Competency>[],
  families: readonly MisconceptionFamilyRollup[],
): CompetencyFinding[] {
  const measured = competencies.filter((c) => c.testedCount > 0);
  const mean =
    measured.length > 0
      ? measured.reduce((sum, c) => sum + c.composite, 0) / measured.length
      : NEUTRAL_COMPETENCY;

  return competencies
    .map((axis) => ({
      competency: axis.key,
      composite: axis.composite,
      testedCount: axis.testedCount,
      kcCount: axis.kcCount,
      families: families.filter((f) => f.family.competency === axis.key),
      standoutWeakness: axis.testedCount > 0 && axis.composite < mean - STANDOUT_MARGIN,
    }))
    .sort((a, b) => a.composite - b.composite || a.competency.localeCompare(b.competency));
}
