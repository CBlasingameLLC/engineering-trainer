import type { Attempt } from '../types.js';

/**
 * Experience points.
 *
 * The whole risk of putting a score on studying is that the score becomes the
 * goal, and the cheapest way to raise a naive score is to answer easy questions
 * you already know. That is precisely the study behaviour spaced repetition
 * exists to prevent, so the reward has to point the other way:
 *
 * - harder items pay more, scaled by their calibrated difficulty;
 * - recalling something you had nearly forgotten pays a large bonus, because
 *   that retrieval is where the learning actually happens;
 * - a fresh, fully-retrievable item pays almost nothing extra.
 *
 * The result is that grinding easy material is the worst way to earn XP, which
 * is the only honest design for a tool whose purpose is finding weaknesses.
 */

export interface XpParams {
  /** XP for a correct answer at difficulty 0 with full retrievability. */
  base: number;
  /** Extra XP per logit of item difficulty above zero. */
  perLogit: number;
  /** Maximum multiplier from the retrieval-effort bonus. */
  maxRetrievalBonus: number;
  /** Fraction of XP withheld per hint used. */
  hintPenalty: number;
  /** Share of base XP for an honest wrong attempt. Effort is not worth zero. */
  incorrectShare: number;
}

export const DEFAULT_XP_PARAMS: XpParams = {
  base: 10,
  perLogit: 4,
  maxRetrievalBonus: 2,
  hintPenalty: 0.25,
  incorrectShare: 0.2,
};

export interface XpInput {
  correct: boolean;
  /** Item difficulty on the logit scale. */
  difficultyB: number;
  hintsUsed: number;
  /**
   * FSRS retrievability for this KC *before* the attempt, in [0,1]. Low means
   * the learner was about to lose it, which makes a successful recall valuable.
   */
  retrievabilityBefore: number;
}

export interface XpAward {
  total: number;
  /** Difficulty-scaled base, before bonuses and penalties. */
  base: number;
  /** Extra awarded for recalling faded material. */
  retrievalBonus: number;
  /** Subtracted for hints. */
  hintPenalty: number;
}

export function xpForAttempt(input: XpInput, params: XpParams = DEFAULT_XP_PARAMS): XpAward {
  const difficultyScaled = Math.max(
    params.base * 0.25,
    params.base + params.perLogit * input.difficultyB,
  );

  if (!input.correct) {
    // A wrong answer still moved the model forward, and paying nothing for it
    // teaches the learner to avoid material they might get wrong.
    const total = Math.round(difficultyScaled * params.incorrectShare);
    return { total, base: total, retrievalBonus: 0, hintPenalty: 0 };
  }

  // Desirable difficulty: the further retrievability had fallen, the more the
  // successful retrieval is worth. Full marks at R = 0, nothing at R = 1.
  const faded = Math.min(1, Math.max(0, 1 - input.retrievabilityBefore));
  const bonusMultiplier = 1 + (params.maxRetrievalBonus - 1) * faded;
  const withBonus = difficultyScaled * bonusMultiplier;
  const retrievalBonus = withBonus - difficultyScaled;

  const penaltyFactor = Math.max(0, 1 - params.hintPenalty * input.hintsUsed);
  const total = Math.round(withBonus * penaltyFactor);

  return {
    total,
    base: Math.round(difficultyScaled),
    retrievalBonus: Math.round(retrievalBonus),
    hintPenalty: Math.round(withBonus - withBonus * penaltyFactor),
  };
}

/** Total XP for a finished session. */
export function xpForSession(
  awards: readonly XpAward[],
): { total: number; fromRetrieval: number } {
  return {
    total: awards.reduce((sum, a) => sum + a.total, 0),
    fromRetrieval: awards.reduce((sum, a) => sum + a.retrievalBonus, 0),
  };
}

/**
 * Level from cumulative XP.
 *
 * Quadratic spacing, so early levels arrive quickly and later ones represent
 * real accumulated work rather than a treadmill of equal steps.
 */
export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
export const xpForLevel = (level: number): number => 50 * (level - 1) ** 2;

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = ceiling - floor;
  return {
    level,
    xpIntoLevel: xp - floor,
    xpForNextLevel: span,
    fraction: span === 0 ? 0 : (xp - floor) / span,
  };
}

/** Convenience: award XP straight from a logged attempt. */
export const xpForAttemptRecord = (
  attempt: Attempt,
  difficultyB: number,
  retrievabilityBefore: number,
  params: XpParams = DEFAULT_XP_PARAMS,
): XpAward =>
  xpForAttempt(
    { correct: attempt.correct, difficultyB, hintsUsed: attempt.hintsUsed, retrievabilityBefore },
    params,
  );
