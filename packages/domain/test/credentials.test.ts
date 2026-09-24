import { describe, expect, it } from 'vitest';
import {
  gapFillValue,
  rankCredentials,
  readinessFor,
  shortlist,
  type CredentialInput,
} from '../src/credentials/rank.js';
import { computeMastery, type KcMastery } from '../src/mastery/composite.js';
import { newRetention, reviewRetention } from '../src/mastery/retention.js';
import { Rating } from 'ts-fsrs';
import type { KcId } from '../src/types.js';

const T0 = new Date('2026-09-15T00:00:00Z');

/** A measured KC at a chosen composite mastery. */
function masteryAt(kcId: KcId, composite: number): KcMastery {
  // Retention is fresh, so composite is carried by belief alone.
  const retention = reviewRetention(newRetention(T0), Rating.Good, T0);
  const m = computeMastery(
    { kcId, pMastery: composite, ability: { theta: 0, n: 8, info: 2 }, retention },
    T0,
  );
  return { ...m, composite, pMastery: composite };
}

const credential = (over: Partial<CredentialInput> & { id: string }): CredentialInput => ({
  name: over.id,
  provider: 'test',
  effortHours: 10,
  signalStrength: 0.5,
  learningValue: 0.5,
  tracks: [{ track: 'semiconductor-vlsi', relevance: 1 }],
  reinforcesKcs: [],
  assumesKcs: [],
  cost: { tier: 'free' },
  ...over,
});

describe('gapFillValue', () => {
  it('is neutral when nothing it reinforces has been measured', () => {
    // Plenty of credentials are worth doing for reasons the mastery model
    // cannot see, so absence of evidence must not be treated as evidence.
    expect(gapFillValue(credential({ id: 'a', reinforcesKcs: ['kc.x'] }), new Map())).toBe(0.5);
  });

  it('rises when the material it reinforces is weak', () => {
    const weak = new Map([['kc.x', masteryAt('kc.x', 0.1)]]);
    const strong = new Map([['kc.x', masteryAt('kc.x', 0.95)]]);
    const c = credential({ id: 'a', reinforcesKcs: ['kc.x'] });
    expect(gapFillValue(c, weak)).toBeGreaterThan(gapFillValue(c, strong));
  });

  it('averages across the KCs it touches rather than summing', () => {
    // Summing would let a credential claiming many topics outrank a focused
    // one purely by listing more.
    const mastery = new Map([
      ['kc.x', masteryAt('kc.x', 0.1)],
      ['kc.y', masteryAt('kc.y', 0.95)],
    ]);
    const both = gapFillValue(credential({ id: 'a', reinforcesKcs: ['kc.x', 'kc.y'] }), mastery);
    const weakOnly = gapFillValue(credential({ id: 'b', reinforcesKcs: ['kc.x'] }), mastery);
    expect(both).toBeLessThan(weakOnly);
  });

  it('ignores KCs with no attempts', () => {
    const untested = new Map([['kc.x', { ...masteryAt('kc.x', 0.1), attempts: 0 }]]);
    expect(gapFillValue(credential({ id: 'a', reinforcesKcs: ['kc.x'] }), untested)).toBe(0.5);
  });
});

describe('readinessFor', () => {
  it('is ready when nothing is assumed', () => {
    expect(readinessFor(credential({ id: 'a' }), new Map())).toBe('ready');
  });

  it('flags a credential whose prerequisites are missing as premature', () => {
    const mastery = new Map([['kc.pre', masteryAt('kc.pre', 0.15)]]);
    expect(readinessFor(credential({ id: 'a', assumesKcs: ['kc.pre'] }), mastery)).toBe('premature');
  });

  it('reports a stretch when prerequisites are partial', () => {
    const mastery = new Map([['kc.pre', masteryAt('kc.pre', 0.5)]]);
    expect(readinessFor(credential({ id: 'a', assumesKcs: ['kc.pre'] }), mastery)).toBe('stretch');
  });

  it('judges by the weakest prerequisite, not the average', () => {
    const mastery = new Map([
      ['kc.a', masteryAt('kc.a', 0.95)],
      ['kc.b', masteryAt('kc.b', 0.1)],
    ]);
    expect(readinessFor(credential({ id: 'x', assumesKcs: ['kc.a', 'kc.b'] }), mastery)).toBe('premature');
  });
});

describe('rankCredentials', () => {
  const base = { track: 'semiconductor-vlsi' as const, mastery: new Map<KcId, KcMastery>() };

  it('ranks an on-track credential above an off-track one', () => {
    const ranked = rankCredentials(
      [
        credential({ id: 'off', tracks: [{ track: 'power-energy', relevance: 1 }] }),
        credential({ id: 'on', tracks: [{ track: 'semiconductor-vlsi', relevance: 1 }] }),
      ],
      base,
    );
    expect(ranked[0]!.credential.id).toBe('on');
  });

  it('prefers the shorter of two otherwise identical credentials', () => {
    // Time is the binding constraint for a full-time student, so effort has to
    // divide rather than merely inform.
    const ranked = rankCredentials(
      [credential({ id: 'long', effortHours: 300 }), credential({ id: 'short', effortHours: 3 })],
      base,
    );
    expect(ranked[0]!.credential.id).toBe('short');
  });

  it('does not let a long programme win on hours alone', () => {
    // The concrete case this exists for: a 300-hour web certificate against a
    // 2-hour vendor module, for a semiconductor student.
    const ranked = rankCredentials(
      [
        credential({
          id: 'web',
          effortHours: 300,
          signalStrength: 0.1,
          learningValue: 0.5,
          tracks: [{ track: 'general-engineering', relevance: 0.15 }],
        }),
        credential({
          id: 'matlab',
          effortHours: 2,
          signalStrength: 0.45,
          learningValue: 0.35,
          tracks: [{ track: 'semiconductor-vlsi', relevance: 0.7 }],
        }),
      ],
      base,
    );
    expect(ranked[0]!.credential.id).toBe('matlab');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score * 5);
  });

  it('takes the better of signal and learning rather than averaging them', () => {
    // Averaging buries both a pure-signal and a pure-learning credential under
    // the mediocre middle, when in fact either is worth doing.
    const ranked = rankCredentials(
      [
        credential({ id: 'signal-only', signalStrength: 0.95, learningValue: 0.1 }),
        credential({ id: 'middling', signalStrength: 0.5, learningValue: 0.5 }),
      ],
      base,
    );
    expect(ranked[0]!.credential.id).toBe('signal-only');
  });

  it('promotes a credential that targets measured weakness', () => {
    const mastery = new Map([['kc.weak', masteryAt('kc.weak', 0.1)]]);
    const ranked = rankCredentials(
      [
        credential({ id: 'targets-gap', reinforcesKcs: ['kc.weak'] }),
        credential({ id: 'generic' }),
      ],
      { ...base, mastery },
    );
    expect(ranked[0]!.credential.id).toBe('targets-gap');
    expect(ranked[0]!.gapFill).toBeGreaterThan(0.5);
  });

  it('demotes a credential the learner is not ready for', () => {
    const mastery = new Map([['kc.pre', masteryAt('kc.pre', 0.1)]]);
    const ranked = rankCredentials(
      [credential({ id: 'premature', assumesKcs: ['kc.pre'] }), credential({ id: 'ready' })],
      { ...base, mastery },
    );
    expect(ranked[0]!.credential.id).toBe('ready');
    expect(ranked.find((r) => r.credential.id === 'premature')!.readiness).toBe('premature');
  });

  it('filters paid credentials when asked, keeping student-free ones', () => {
    const ranked = rankCredentials(
      [
        credential({ id: 'paid', cost: { tier: 'paid', usd: 100 } }),
        credential({ id: 'student', cost: { tier: 'free-for-students' } }),
        credential({ id: 'free', cost: { tier: 'free' } }),
      ],
      { ...base, freeOnly: true },
    );
    expect(ranked.map((r) => r.credential.id).sort()).toEqual(['free', 'student']);
  });

  it('flags rather than hides credentials beyond the hour budget', () => {
    // Hiding them would silently remove the highest-value option from view.
    const ranked = rankCredentials([credential({ id: 'big', effortHours: 300 })], {
      ...base,
      budgetHours: 40,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.overBudget).toBe(true);
  });

  it('treats general-engineering as a floor under every specific track', () => {
    // Regression guard. Without this, a credential tagged only as generally
    // useful scores exactly zero against any specific track and disappears -
    // which is how MATLAB Onramp came to be rated irrelevant to a
    // semiconductor student despite being the best value in the catalog.
    const general = credential({
      id: 'general',
      tracks: [{ track: 'general-engineering', relevance: 1 }],
    });
    const ranked = rankCredentials([general], base);
    expect(ranked[0]!.relevance).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeGreaterThan(0);
  });

  it('still ranks an exact track match above a merely general one', () => {
    const ranked = rankCredentials(
      [
        credential({ id: 'general', tracks: [{ track: 'general-engineering', relevance: 1 }] }),
        credential({ id: 'exact', tracks: [{ track: 'semiconductor-vlsi', relevance: 1 }] }),
      ],
      base,
    );
    expect(ranked[0]!.credential.id).toBe('exact');
  });

  it('gives an off-track credential a small score rather than exactly zero', () => {
    // Zero reads as a bug; a small number reads as a judgement.
    const ranked = rankCredentials(
      [credential({ id: 'web', tracks: [{ track: 'general-engineering', relevance: 0.15 }] })],
      base,
    );
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeLessThan(0.5);
  });

  it('is deterministic when scores tie', () => {
    const a = rankCredentials([credential({ id: 'b' }), credential({ id: 'a' })], base);
    expect(a.map((r) => r.credential.id)).toEqual(['a', 'b']);
  });

  it('explains every placement in plain language', () => {
    const ranked = rankCredentials([credential({ id: 'a', effortHours: 2 })], base);
    expect(ranked[0]!.rationale.length).toBeGreaterThan(10);
    expect(ranked[0]!.rationale).toMatch(/takes only 2 hours/);
  });
});

describe('shortlist', () => {
  const base = { track: 'semiconductor-vlsi' as const, mastery: new Map<KcId, KcMastery>() };

  it('excludes anything premature or over budget', () => {
    const mastery = new Map([['kc.pre', masteryAt('kc.pre', 0.1)]]);
    const ranked = rankCredentials(
      [
        credential({ id: 'ok' }),
        credential({ id: 'premature', assumesKcs: ['kc.pre'] }),
        credential({ id: 'huge', effortHours: 300 }),
      ],
      { ...base, mastery, budgetHours: 40 },
    );
    expect(shortlist(ranked).map((r) => r.credential.id)).toEqual(['ok']);
  });

  it('stays short enough to act on', () => {
    const many = Array.from({ length: 20 }, (_, i) => credential({ id: `c${i}` }));
    expect(shortlist(rankCredentials(many, base)).length).toBeLessThanOrEqual(5);
  });
});
