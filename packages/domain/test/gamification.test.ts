import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHALLENGE_CONFIG, KcGraph, blockingPrerequisites, challengeReadiness, dailyQuest,
  dayKey, daysBetween, emptyStreak, gradeChallenge, layoutGraph, levelProgress, levelForXp,
  questProgress, recordActivity, skillStates, streakAsOf, xpForAttempt, xpForSession,
  type Kc, type KcEdge, type KcMastery,
} from '../src/index.js';

const kc = (id: string, courseId = 'EE2300'): Kc => ({
  id,
  courseId,
  title: id,
  unit: 'unit',
  domain: 'circuits',
  competencies: ['concept'],
  difficultyPrior: 0,
});

const mastery = (kcId: string, composite: number, attempts = 3): KcMastery => ({
  kcId,
  pMastery: composite,
  retrievability: composite === 0 ? 0 : 1,
  composite,
  band: composite >= 0.85 ? 'mastered' : composite >= 0.65 ? 'proficient' : composite >= 0.4 ? 'developing' : 'gap',
  diagnosis: attempts === 0 ? 'untested' : 'solid',
  stabilityDays: 10,
  standardError: 1,
  attempts,
});

describe('experience points', () => {
  it('pays more for a harder item', () => {
    const easy = xpForAttempt({ correct: true, difficultyB: -1.5, hintsUsed: 0, retrievabilityBefore: 1 });
    const hard = xpForAttempt({ correct: true, difficultyB: 1.5, hintsUsed: 0, retrievabilityBefore: 1 });
    expect(hard.total).toBeGreaterThan(easy.total);
  });

  it('pays a large bonus for recalling something nearly forgotten', () => {
    // The central design claim: grinding fresh, easy material must be the worst
    // way to earn XP, or the score rewards exactly the studying the app exists
    // to discourage.
    const fresh = xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 1 });
    const faded = xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 0.1 });
    expect(faded.total).toBeGreaterThan(fresh.total * 1.5);
    expect(fresh.retrievalBonus).toBe(0);
    expect(faded.retrievalBonus).toBeGreaterThan(0);
  });

  it('never lets an easy fresh item outpay a hard faded one', () => {
    const easyFresh = xpForAttempt({ correct: true, difficultyB: -2, hintsUsed: 0, retrievabilityBefore: 1 });
    const hardFaded = xpForAttempt({ correct: true, difficultyB: 2, hintsUsed: 0, retrievabilityBefore: 0.2 });
    expect(hardFaded.total).toBeGreaterThan(easyFresh.total);
  });

  it('withholds XP for hints without zeroing the award', () => {
    const clean = xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 1 });
    const hinted = xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 2, retrievabilityBefore: 1 });
    expect(hinted.total).toBeLessThan(clean.total);
    expect(hinted.total).toBeGreaterThan(0);
  });

  it('pays something for an honest wrong answer', () => {
    const wrong = xpForAttempt({ correct: false, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 1 });
    expect(wrong.total).toBeGreaterThan(0);
    const right = xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 1 });
    expect(wrong.total).toBeLessThan(right.total);
  });

  it('keeps a floor under very easy items so XP never goes negative', () => {
    const trivial = xpForAttempt({ correct: true, difficultyB: -4, hintsUsed: 0, retrievabilityBefore: 1 });
    expect(trivial.total).toBeGreaterThan(0);
  });

  it('sums a session and reports how much came from retrieval', () => {
    const awards = [
      xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 0.1 }),
      xpForAttempt({ correct: true, difficultyB: 0, hintsUsed: 0, retrievabilityBefore: 1 }),
    ];
    const summary = xpForSession(awards);
    expect(summary.total).toBe(awards[0]!.total + awards[1]!.total);
    expect(summary.fromRetrieval).toBeGreaterThan(0);
  });

  it('spaces levels quadratically', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(200)).toBe(3);
    const progress = levelProgress(75);
    expect(progress.level).toBe(2);
    expect(progress.fraction).toBeGreaterThan(0);
    expect(progress.fraction).toBeLessThan(1);
  });
});

describe('streaks', () => {
  const day = (iso: string): Date => new Date(`${iso}T12:00:00`);

  it('counts calendar days, not elapsed hours', () => {
    expect(daysBetween('2026-01-01', '2026-01-02')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 is not a leap year
    expect(dayKey(day('2026-09-15'))).toBe('2026-09-15');
  });

  it('starts, extends, and ignores a second session the same day', () => {
    let state = emptyStreak();
    state = recordActivity(state, day('2026-01-01')).state;
    expect(state.current).toBe(1);

    state = recordActivity(state, day('2026-01-02')).state;
    expect(state.current).toBe(2);

    const same = recordActivity(state, day('2026-01-02'));
    expect(same.outcome).toBe('already-done-today');
    expect(same.state.current).toBe(2);
  });

  it('earns a freeze every seven days and caps the stockpile', () => {
    let state = emptyStreak();
    for (let d = 1; d <= 28; d++) {
      state = recordActivity(state, day(`2026-01-${String(d).padStart(2, '0')}`)).state;
    }
    expect(state.current).toBe(28);
    // Four freezes earned, capped at three.
    expect(state.freezes).toBe(3);
    expect(state.longest).toBe(28);
  });

  it('spends a freeze to cover a missed day rather than resetting', () => {
    let state = emptyStreak();
    for (let d = 1; d <= 7; d++) {
      state = recordActivity(state, day(`2026-01-${String(d).padStart(2, '0')}`)).state;
    }
    expect(state.freezes).toBe(1);

    // Skip the 8th, return on the 9th.
    const update = recordActivity(state, day('2026-01-09'));
    expect(update.outcome).toBe('frozen');
    expect(update.freezesSpent).toBe(1);
    expect(update.state.current).toBe(8);
    expect(update.state.freezes).toBe(0);
  });

  it('breaks when there are not enough freezes, and says so', () => {
    let state = emptyStreak();
    state = recordActivity(state, day('2026-01-01')).state;
    state = recordActivity(state, day('2026-01-02')).state;

    const update = recordActivity(state, day('2026-01-10'));
    expect(update.outcome).toBe('broken');
    expect(update.state.current).toBe(1);
    // The longest streak is a record of what happened and survives the break.
    expect(update.state.longest).toBe(2);
  });

  it('reports a streak as at risk before the learner opens a session', () => {
    let state = emptyStreak();
    state = recordActivity(state, day('2026-01-01')).state;

    expect(streakAsOf(state, day('2026-01-01')).atRisk).toBe(false);
    const tomorrow = streakAsOf(state, day('2026-01-02'));
    expect(tomorrow.current).toBe(1);
    expect(tomorrow.atRisk).toBe(true);

    // Far enough past with no freezes and it is simply gone, which the
    // dashboard must show rather than claiming an intact streak.
    expect(streakAsOf(state, day('2026-01-20')).current).toBe(0);
  });
});

// ---------------------------------------------------------------------------

const chain = (): KcGraph => {
  const kcs = [kc('a'), kc('b'), kc('c'), kc('d')];
  const edges: KcEdge[] = [
    { from: 'a', to: 'b', strength: 0.9 },
    { from: 'b', to: 'c', strength: 0.9 },
    { from: 'a', to: 'd', strength: 0.9 },
  ];
  return new KcGraph(kcs, edges);
};

describe('daily quest', () => {
  it('draws review work from what has decayed, most perishable first', () => {
    const graph = chain();
    const faded: KcMastery = { ...mastery('a', 0.5), retrievability: 0.3, pMastery: 0.8 };
    const worse: KcMastery = { ...mastery('b', 0.4), retrievability: 0.1, pMastery: 0.8 };
    const quest = dailyQuest(graph, new Map([['a', faded], ['b', worse]]));
    expect(quest.reviewKcs[0]).toBe('b');
  });

  it('offers new material only where prerequisites are in place', () => {
    const graph = chain();
    // `a` is mastered, so `b` and `d` unlock; `c` still needs `b`.
    const quest = dailyQuest(graph, new Map([['a', mastery('a', 0.9)]]));
    expect(quest.frontierKcs).toContain('b');
    expect(quest.frontierKcs).not.toContain('c');
  });

  it('is stable across a day so reopening the app does not reroll it', () => {
    const graph = chain();
    const now = new Date('2026-05-05T09:00:00');
    const later = new Date('2026-05-05T21:00:00');
    const m = new Map([['a', mastery('a', 0.9)]]);
    expect(dailyQuest(graph, m, { now }).id).toBe(dailyQuest(graph, m, { now: later }).id);
  });

  it('explains itself when there is nothing to do yet', () => {
    const quest = dailyQuest(new KcGraph([kc('a')], []), new Map());
    expect(quest.rationale).toMatch(/placement exam|ready to start|new topic/);
  });

  it('tracks progress toward the target', () => {
    const quest = dailyQuest(chain(), new Map([['a', mastery('a', 0.9)]]), { targetItems: 10 });
    expect(questProgress(quest, 4).complete).toBe(false);
    expect(questProgress(quest, 10).complete).toBe(true);
    expect(questProgress(quest, 5).fraction).toBeCloseTo(0.5);
  });
});

describe('challenge exams', () => {
  const graph = new KcGraph([kc('a'), kc('b'), kc('c'), kc('d')], []);
  const answers = (kcId: string, right: number, wrong: number) => [
    ...Array.from({ length: right }, () => ({ kcIds: [kcId], correct: true })),
    ...Array.from({ length: wrong }, () => ({ kcIds: [kcId], correct: false })),
  ];

  it('passes a broad, high-scoring exam', () => {
    const responses = [
      ...answers('a', 6, 0), ...answers('b', 6, 0), ...answers('c', 6, 1), ...answers('d', 6, 1),
    ];
    const result = gradeChallenge('EE2300', graph, responses);
    expect(result.passed).toBe(true);
    expect(result.crest).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails a high score that only covered part of the course', () => {
    // The property that makes the crest mean something: 100% on two of four
    // topics is not evidence about the course, and must not pass.
    const responses = [...answers('a', 15, 0), ...answers('b', 15, 0)];
    const result = gradeChallenge('EE2300', graph, responses);
    expect(result.scoreFraction).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/covered 50% of the course/);
  });

  it('fails when a single topic is consistently wrong despite a good total', () => {
    const responses = [
      ...answers('a', 10, 0), ...answers('b', 10, 0), ...answers('c', 8, 0), ...answers('d', 0, 4),
    ];
    const result = gradeChallenge('EE2300', graph, responses);
    expect(result.failedKcs).toEqual(['d']);
    expect(result.passed).toBe(false);
  });

  it('does not judge a topic from a single miss', () => {
    const responses = [
      ...answers('a', 8, 0), ...answers('b', 8, 0), ...answers('c', 8, 0), ...answers('d', 0, 1),
    ];
    const result = gradeChallenge('EE2300', graph, responses);
    expect(result.failedKcs).toEqual([]);
  });

  it('refuses to conclude anything from too few items', () => {
    const result = gradeChallenge('EE2300', graph, [...answers('a', 3, 0)]);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/only 3 of 20 items/);
  });

  it('holds back the boss until the learner is plausibly ready', () => {
    const weak = new Map([['a', { composite: 0.2, attempts: 3 }]]);
    expect(challengeReadiness('EE2300', graph, weak).ready).toBe(false);

    const strong = new Map(
      ['a', 'b', 'c', 'd'].map((id) => [id, { composite: 0.8, attempts: 5 }] as const),
    );
    expect(challengeReadiness('EE2300', graph, strong).ready).toBe(true);
  });

  it('uses the configured thresholds', () => {
    const responses = [...answers('a', 5, 0), ...answers('b', 5, 0)];
    const lenient = gradeChallenge('EE2300', graph, responses, {
      ...DEFAULT_CHALLENGE_CONFIG, minItems: 10, coverageThreshold: 0.5,
    });
    expect(lenient.passed).toBe(true);
  });
});

describe('skill tree layout', () => {
  it('places every KC below all of its prerequisites', () => {
    const graph = chain();
    const { nodes } = layoutGraph(graph);
    const layer = new Map(nodes.map((n) => [n.kcId, n.layer]));
    for (const kcId of graph.kcs.keys()) {
      for (const edge of graph.prerequisites(kcId)) {
        expect(layer.get(kcId)!, `${kcId} must sit below ${edge.from}`).toBeGreaterThan(layer.get(edge.from)!);
      }
    }
  });

  it('is deterministic, so the board does not reshuffle between renders', () => {
    const graph = chain();
    expect(layoutGraph(graph).nodes).toEqual(layoutGraph(graph).nodes);
  });

  it('marks an edge crossing course boundaries', () => {
    const graph = new KcGraph(
      [kc('math.deriv', 'MATH2471'), kc('ee.cap', 'EE2300')],
      [{ from: 'math.deriv', to: 'ee.cap', strength: 0.5 }],
    );
    const { edges } = layoutGraph(graph);
    expect(edges[0]!.crossCourse).toBe(true);
  });

  it('locks a KC whose prerequisite is weak, and names the blocker', () => {
    const graph = chain();
    const states = skillStates(graph, new Map([['a', mastery('a', 0.2)]]));
    expect(states.get('a')).toBe('learning');
    expect(states.get('b')).toBe('locked');
    expect(blockingPrerequisites(graph, new Map([['a', mastery('a', 0.2)]]), 'b')).toEqual(['a']);
  });

  it('unlocks dependents once a prerequisite is strong enough', () => {
    const graph = chain();
    const states = skillStates(graph, new Map([['a', mastery('a', 0.9)]]));
    expect(states.get('a')).toBe('mastered');
    expect(states.get('b')).toBe('available');
    expect(states.get('c')).toBe('locked');
  });

  it('treats a root KC with no evidence as available, never locked', () => {
    const states = skillStates(new KcGraph([kc('a')], []), new Map());
    expect(states.get('a')).toBe('available');
  });

  it('gives the layout a usable extent', () => {
    const layout = layoutGraph(chain(), { columnGap: 100, rowGap: 80 });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBe(layout.layers.length * 80);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(layout.width);
    }
  });
});
