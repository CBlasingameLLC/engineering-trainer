/**
 * Core domain vocabulary. Pure data — no I/O, no framework types.
 */

export type CourseId = string; // "EE2300"
export type KcId = string; // "ee2300.thevenin"
export type ItemId = string;
export type MisconceptionId = string; // "thevenin.source-not-suppressed"

/**
 * Competency axis — *how* a learner is being asked to think. Orthogonal to
 * subject matter, which is what makes cross-course diagnosis possible: weak
 * `math-execution` across circuits AND signals AND physics points at algebra
 * discipline, not at any one course.
 */
export const COMPETENCIES = [
  'math-execution', // algebraic/calculus manipulation carried out accurately
  'concept', // qualitative and physical understanding
  'modeling', // physical situation -> equations / schematic
  'strategy', // method selection and solution planning
  'numeracy', // units, magnitudes, significant figures, sanity checks
  'visual', // reading and constructing schematics, plots, diagrams
] as const;
export type Competency = (typeof COMPETENCIES)[number];

/** Subject-matter axis. */
export const DOMAINS = [
  'math',
  'physics',
  'circuits',
  'digital',
  'signals',
  'devices',
  'em',
  'programming',
] as const;
export type Domain = (typeof DOMAINS)[number];

/** A knowledge component: the atomic unit mastery is tracked against. */
export interface Kc {
  id: KcId;
  courseId: CourseId;
  title: string;
  unit: string;
  domain: Domain;
  competencies: Competency[];
  /** Prior difficulty on the logit scale; seeds item difficulty for new items. */
  difficultyPrior: number;
  description?: string;
}

/** A prerequisite edge. `from` must be understood before `to`. */
export interface KcEdge {
  from: KcId;
  to: KcId;
  /** 0..1 — how strongly `to` depends on `from`. Scales prior propagation. */
  strength: number;
}

/** An item's weighted attribution across the KCs it exercises. Weights sum to 1. */
export interface KcRef {
  kc: KcId;
  weight: number;
}

/** A single graded response. Append-only: the source of truth for replay. */
export interface Attempt {
  itemId: ItemId;
  kcRefs: KcRef[];
  correct: boolean;
  /** Wall-clock time spent on the item. */
  latencyMs: number;
  hintsUsed: number;
  /** Misconception ids implicated by the chosen distractor, if any. */
  misconceptions: MisconceptionId[];
  at: Date;
  /** Number of options, for MC items — sets the BKT guess floor. */
  optionCount?: number;
}

export type MasteryBand = 'gap' | 'developing' | 'proficient' | 'mastered';
