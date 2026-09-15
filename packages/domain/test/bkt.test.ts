import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BKT_PARAMS,
  bktPosterior,
  bktReplay,
  bktUpdate,
  guessFloor,
  priorFromAbility,
} from '../src/mastery/bkt.js';
import type { Attempt } from '../src/types.js';

const P = DEFAULT_BKT_PARAMS;

describe('bktPosterior', () => {
  it('matches the hand-computed posterior for a correct answer', () => {
    // pL=0.5, slip=0.1, guess=0.05
    //   num = 0.5 * 0.9                = 0.45
    //   den = 0.5 * 0.9 + 0.5 * 0.05   = 0.475
    expect(bktPosterior(0.5, true, P)).toBeCloseTo(0.45 / 0.475, 12);
  });

  it('matches the hand-computed posterior for a wrong answer', () => {
    //   num = 0.5 * 0.1                = 0.05
    //   den = 0.5 * 0.1 + 0.5 * 0.95   = 0.525
    expect(bktPosterior(0.5, false, P)).toBeCloseTo(0.05 / 0.525, 12);
  });

  it('raises belief on success and lowers it on failure', () => {
    expect(bktPosterior(0.5, true, P)).toBeGreaterThan(0.5);
    expect(bktPosterior(0.5, false, P)).toBeLessThan(0.5);
  });

  it('stays within [0,1] at the extremes', () => {
    for (const pL of [0, 1e-9, 0.5, 1 - 1e-9, 1]) {
      for (const correct of [true, false]) {
        const post = bktPosterior(pL, correct, P);
        expect(post).toBeGreaterThanOrEqual(0);
        expect(post).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('guessFloor', () => {
  it('floors the guess rate at 1/n for multiple choice', () => {
    expect(guessFloor(P, 4)).toBeCloseTo(0.25, 12);
    expect(guessFloor(P, 2)).toBeCloseTo(0.5, 12);
  });

  it('keeps the configured rate for free-response items', () => {
    expect(guessFloor(P, undefined)).toBe(P.pGuess);
  });

  it('makes a correct 4-option answer weaker evidence than a free-response one', () => {
    expect(bktPosterior(0.4, true, P, 4)).toBeLessThan(bktPosterior(0.4, true, P));
  });
});

describe('bktUpdate', () => {
  it('applies the learning opportunity after conditioning', () => {
    const posterior = bktPosterior(0.5, true, P);
    expect(bktUpdate(0.5, true, P)).toBeCloseTo(posterior + (1 - posterior) * P.pTransit, 12);
  });

  it('can still rise after a wrong answer, because answering is a chance to learn', () => {
    const posterior = bktPosterior(0.5, false, P);
    expect(bktUpdate(0.5, false, P)).toBeGreaterThan(posterior);
  });

  it('converges toward mastery under a streak of correct answers', () => {
    let pL = P.pInit;
    for (let i = 0; i < 12; i++) pL = bktUpdate(pL, true, P);
    expect(pL).toBeGreaterThan(0.95);
  });

  it('collapses toward zero under a streak of wrong answers', () => {
    let pL = 0.9;
    for (let i = 0; i < 12; i++) pL = bktUpdate(pL, false, P);
    expect(pL).toBeLessThan(0.25);
  });
});

describe('bktReplay', () => {
  it('is equivalent to folding updates in order', () => {
    const attempt = (correct: boolean): Attempt => ({
      itemId: 'i', kcRefs: [{ kc: 'k', weight: 1 }], correct,
      latencyMs: 1000, hintsUsed: 0, misconceptions: [], at: new Date(),
    });
    const seq = [true, true, false, true, true];
    const attempts = seq.map(attempt);

    let manual = P.pInit;
    for (const c of seq) manual = bktUpdate(manual, c, P);

    expect(bktReplay(attempts, P)).toBeCloseTo(manual, 12);
  });
});

describe('priorFromAbility', () => {
  it('maps the logit scale onto a probability', () => {
    expect(priorFromAbility(0, 0)).toBeCloseTo(0.5, 12);
    expect(priorFromAbility(2, 0)).toBeGreaterThan(0.85);
    expect(priorFromAbility(-2, 0)).toBeLessThan(0.15);
  });
});
