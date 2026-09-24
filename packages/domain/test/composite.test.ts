import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import {
  BAND_THRESHOLDS,
  bandFor,
  byCompetency,
  byDomain,
  computeMastery,
  decayRisk,
  diagnose,
  type KcStateInput,
} from '../src/mastery/composite.js';
import { newAbility, type Ability } from '../src/mastery/elo.js';
import {
  GRADE_TO_PRIOR,
  gradeFromAttempt,
  isDue,
  newRetention,
  retrievability,
  reviewRetention,
  seedFromCourseCompletion,
  stability,
} from '../src/mastery/retention.js';
import type { Kc, KcId } from '../src/types.js';

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00Z');
const at = (days: number): Date => new Date(T0.getTime() + days * DAY);

/** An ability with `n` observations, enough information to look measured. */
const measured = (theta: number, n = 10): Ability => ({ theta, n, info: n * 0.25 });

/**
 * Drive a KC to a well-retained state by reviewing it on a spaced schedule.
 * Reviews land on days 0, 3, 6, ... so the LAST review is at day (reviews-1)*3;
 * queries must be after that or elapsed time goes negative and FSRS reports 1.
 */
function wellLearned(reviews = 5) {
  let state = newRetention(T0);
  for (let i = 0; i < reviews; i++) state = reviewRetention(state, Rating.Good, at(i * 3));
  return state;
}

/** Day of the final review produced by `wellLearned(reviews)`. */
const lastReviewDay = (reviews = 5): number => (reviews - 1) * 3;

describe('bandFor', () => {
  it('partitions the composite range into the four display bands', () => {
    expect(bandFor(0.2)).toBe('gap');
    expect(bandFor(BAND_THRESHOLDS.developing)).toBe('developing');
    expect(bandFor(BAND_THRESHOLDS.proficient)).toBe('proficient');
    expect(bandFor(BAND_THRESHOLDS.mastered)).toBe('mastered');
    expect(bandFor(1)).toBe('mastered');
  });
});

describe('diagnose', () => {
  it('reports untested when there is no evidence', () => {
    expect(diagnose(0.9, 0.9, 0)).toBe('untested');
  });

  it('separates a never-learned gap from a learned-but-decayed KC', () => {
    // This distinction is the product. Both would show a low composite score,
    // but they demand opposite remediation: instruction vs. a review session.
    expect(diagnose(0.2, 0.95, 5)).toBe('gap');
    expect(diagnose(0.9, 0.3, 5)).toBe('decayed');
  });

  it('reports solid only when both learned and retained', () => {
    expect(diagnose(0.9, 0.9, 5)).toBe('solid');
  });

  it('reports fragile when belief is middling', () => {
    expect(diagnose(0.55, 0.9, 5)).toBe('fragile');
  });
});

describe('computeMastery', () => {
  it('multiplies belief by retrievability', () => {
    const state: KcStateInput = {
      kcId: 'ee2300.thevenin',
      pMastery: 0.8,
      ability: measured(1.0),
      retention: wellLearned(),
    };
    const m = computeMastery(state, at(15));
    expect(m.composite).toBeCloseTo(m.pMastery * m.retrievability, 12);
  });

  it('reports zero retrievability for an untested KC rather than a full memory', () => {
    const m = computeMastery(
      { kcId: 'k', pMastery: 0.15, ability: newAbility(0), retention: newRetention(T0) },
      T0,
    );
    expect(m.retrievability).toBe(0);
    expect(m.diagnosis).toBe('untested');
  });

  it('flags a prerequisite learned last year as decayed, not as a gap', () => {
    // The Circuits I -> Circuits II case: passed the course last spring with an
    // A, has not touched it since. Belief stays high; recall does not.
    const state: KcStateInput = {
      kcId: 'ee2300.thevenin',
      pMastery: GRADE_TO_PRIOR.A,
      ability: measured(1.5),
      retention: seedFromCourseCompletion(T0, 'A'),
    };
    const fresh = computeMastery(state, at(2));
    const stale = computeMastery(state, at(270));

    expect(fresh.diagnosis).toBe('solid');
    expect(stale.diagnosis).toBe('decayed');
    expect(stale.composite).toBeLessThan(fresh.composite);
    // Belief is untouched by the passage of time; only retrievability moves.
    expect(stale.pMastery).toBeCloseTo(fresh.pMastery, 12);
    expect(stale.retrievability).toBeLessThan(fresh.retrievability);
  });
});

describe('retention', () => {
  it('decays monotonically with elapsed time', () => {
    const state = wellLearned();
    const base = lastReviewDay();
    const rs = [0, 10, 30, 90, 365].map((d) => retrievability(state, at(base + d)));
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeLessThan(rs[i - 1]!);
  });

  it('reports full retrievability for a query before the last review', () => {
    // Guards the caller: a negative elapsed interval is a bug upstream, and
    // FSRS answers 1.0 rather than throwing. Pin the behaviour so it is not
    // mistaken for genuine retention.
    const state = wellLearned();
    expect(retrievability(state, at(lastReviewDay() - 5))).toBe(1);
  });

  it('restores retrievability to near 1 immediately after a review', () => {
    const stale = seedFromCourseCompletion(T0, 'B');
    expect(retrievability(stale, at(300))).toBeLessThan(0.7);
    const reviewed = reviewRetention(stale, Rating.Good, at(300));
    expect(retrievability(reviewed, at(300))).toBeGreaterThan(0.85);
  });

  it('does not inflate stability from coursework the app never observed', () => {
    // Regression guard. Synthesising a semester of study sessions and feeding
    // them to FSRS produces S ~ 270 days, so a year-old prerequisite reports
    // R ~ 0.88 and looks perfectly retained — which would silently defeat the
    // decay detection the product is built on. Seeding one real event instead
    // keeps stability in the days, not the hundreds of days.
    const fabricated = [0, 14, 35, 60, 100].reduce(
      (s, d) => reviewRetention(s, Rating.Good, at(d)),
      newRetention(T0),
    );
    const honest = seedFromCourseCompletion(at(100), 'A');

    expect(stability(fabricated)).toBeGreaterThan(200);
    expect(stability(honest)).toBeLessThan(20);
    expect(retrievability(fabricated, at(465))).toBeGreaterThan(0.85);
    expect(retrievability(honest, at(465))).toBeLessThan(0.62);
  });

  it('grades a completed course into a weaker memory the lower the grade', () => {
    const query = at(270);
    const rA = retrievability(seedFromCourseCompletion(T0, 'A'), query);
    const rB = retrievability(seedFromCourseCompletion(T0, 'B'), query);
    const rC = retrievability(seedFromCourseCompletion(T0, 'C'), query);
    expect(rA).toBeGreaterThan(rB);
    expect(rB).toBeGreaterThan(rC);
    expect(GRADE_TO_PRIOR.A).toBeGreaterThan(GRADE_TO_PRIOR.C);
  });

  it('grows stability with each successful review', () => {
    let state = newRetention(T0);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = reviewRetention(state, Rating.Good, at(i * 7));
      seen.push(stability(state));
    }
    expect(seen.at(-1)!).toBeGreaterThan(seen[0]!);
  });

  it('schedules a lapsed KC for near-immediate review', () => {
    const lapsed = reviewRetention(wellLearned(), Rating.Again, at(60));
    expect(isDue(lapsed, at(61))).toBe(true);
  });
});

describe('gradeFromAttempt', () => {
  const base = { latencyMs: 30_000, hintsUsed: 0, medianLatencyMs: 30_000 };

  it('grades a wrong answer as Again regardless of speed', () => {
    expect(gradeFromAttempt({ ...base, correct: false, latencyMs: 1000 })).toBe(Rating.Again);
  });

  it('downgrades a hinted answer to Hard', () => {
    expect(gradeFromAttempt({ ...base, correct: true, hintsUsed: 1 })).toBe(Rating.Hard);
  });

  it('downgrades a slow answer to Hard and upgrades a fast one to Easy', () => {
    expect(gradeFromAttempt({ ...base, correct: true, latencyMs: 90_000 })).toBe(Rating.Hard);
    expect(gradeFromAttempt({ ...base, correct: true, latencyMs: 10_000 })).toBe(Rating.Easy);
  });

  it('grades a normal correct answer as Good', () => {
    expect(gradeFromAttempt({ ...base, correct: true })).toBe(Rating.Good);
  });
});

describe('aggregation', () => {
  const kcs = new Map<KcId, Kc>([
    ['a', { id: 'a', courseId: 'EE2300', title: 'A', unit: 'u', domain: 'circuits', competencies: ['math-execution', 'strategy'], difficultyPrior: 0 }],
    ['b', { id: 'b', courseId: 'EE2300', title: 'B', unit: 'u', domain: 'circuits', competencies: ['math-execution'], difficultyPrior: 0 }],
    ['c', { id: 'c', courseId: 'MATH2472', title: 'C', unit: 'u', domain: 'math', competencies: ['math-execution'], difficultyPrior: 0 }],
    ['d', { id: 'd', courseId: 'MATH2472', title: 'D', unit: 'u', domain: 'math', competencies: ['concept'], difficultyPrior: 0 }],
  ]);

  const QUERY = at(lastReviewDay() + 5);

  const masteries = [
    computeMastery({ kcId: 'a', pMastery: 0.3, ability: measured(-0.5), retention: wellLearned() }, QUERY),
    computeMastery({ kcId: 'b', pMastery: 0.35, ability: measured(-0.4), retention: wellLearned() }, QUERY),
    computeMastery({ kcId: 'c', pMastery: 0.25, ability: measured(-0.8), retention: wellLearned() }, QUERY),
    computeMastery({ kcId: 'd', pMastery: 0.95, ability: measured(1.8), retention: wellLearned() }, QUERY),
  ];

  it('surfaces a competency weakness that spans every domain', () => {
    // math-execution is weak in BOTH circuits and math, while `concept` is
    // strong. That cross-cutting conclusion is unreachable from course scores.
    const byComp = new Map(byCompetency(masteries, kcs).map((s) => [s.key, s]));
    expect(byComp.get('math-execution')!.composite).toBeLessThan(BAND_THRESHOLDS.developing);
    expect(byComp.get('concept')!.composite).toBeGreaterThan(BAND_THRESHOLDS.proficient);
  });

  it('counts a KC under every competency it carries', () => {
    const byComp = new Map(byCompetency(masteries, kcs).map((s) => [s.key, s]));
    expect(byComp.get('math-execution')!.kcCount).toBe(3);
    expect(byComp.get('strategy')!.kcCount).toBe(1);
  });

  it('partitions KCs across domains', () => {
    const scores = byDomain(masteries, kcs);
    expect(scores.reduce((s, x) => s + x.kcCount, 0)).toBe(kcs.size);
  });

  it('tracks how much of an axis was actually tested', () => {
    const untested = computeMastery(
      { kcId: 'b', pMastery: 0.3, ability: newAbility(0), retention: newRetention(T0) },
      QUERY,
    );
    const scores = byDomain([masteries[0]!, untested], kcs);
    const circuits = scores.find((s) => s.key === 'circuits')!;
    expect(circuits.kcCount).toBe(2);
    expect(circuits.testedCount).toBe(1);
  });
});

describe('decayRisk', () => {
  const state = (kcId: KcId): KcStateInput => ({
    kcId, pMastery: 0.95, ability: measured(1.5), retention: wellLearned(3),
  });

  it('flags a currently-strong KC that will fall below threshold inside the horizon', () => {
    const risks = decayRisk([state('ee2300.thevenin')], { horizonDays: 365, now: at(lastReviewDay(3) + 5) });
    expect(risks).toHaveLength(1);
    expect(risks[0]!.projectedComposite).toBeLessThan(risks[0]!.currentComposite);
    expect(risks[0]!.daysUntilThreshold).toBeGreaterThan(0);
  });

  it('does not flag a KC that is already below threshold — that is a gap, not a risk', () => {
    const weak: KcStateInput = { kcId: 'k', pMastery: 0.2, ability: measured(-1), retention: wellLearned() };
    expect(decayRisk([weak], { horizonDays: 90, now: at(lastReviewDay() + 5) })).toHaveLength(0);
  });

  it('ignores KCs with no evidence at all', () => {
    const untested: KcStateInput = { kcId: 'k', pMastery: 0.5, ability: newAbility(0), retention: newRetention(T0) };
    expect(decayRisk([untested], { horizonDays: 90, now: at(lastReviewDay() + 5) })).toHaveLength(0);
  });

  it('orders the most urgent KC first', () => {
    const risks = decayRisk(
      [
        { kcId: 'soon', pMastery: 0.95, ability: measured(1.5), retention: wellLearned(1) },
        { kcId: 'later', pMastery: 0.95, ability: measured(1.5), retention: wellLearned(6) },
      ],
      { horizonDays: 720, now: at(lastReviewDay(6) + 5) },
    );
    expect(risks.length).toBeGreaterThanOrEqual(2);
    expect(risks[0]!.daysUntilThreshold!).toBeLessThanOrEqual(risks[1]!.daysUntilThreshold!);
  });
});
