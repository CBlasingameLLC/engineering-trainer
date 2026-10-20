import { describe, expect, it } from 'vitest';
import { emptyStreak } from '@et/domain';
import {
  PROGRESS_FORMAT,
  PROGRESS_VERSION,
  encodeProgress,
  exportProgress,
  importProgress,
  mergeProfiles,
  parseProgress,
} from '@/storage/transfer';
import { emptyProfile, type AttemptRecord, type Profile, type StorageAdapter } from '@/storage/types';

/**
 * An in-memory adapter standing in for SQLite and IndexedDB.
 *
 * It copies the one behaviour of theirs that the merge has to respect:
 * `appendAttempt` refuses a duplicate id rather than overwriting, because an id
 * collision upstream means recorded evidence would otherwise be destroyed
 * quietly. A transfer that did not de-duplicate would fail loudly here, which
 * is the point of testing against it.
 */
function fakeStorage(seed: Partial<Record<string, unknown[]>> = {}): StorageAdapter & {
  attempts: AttemptRecord[];
  profile: Profile;
} {
  const state = {
    kind: 'web' as const,
    attempts: (seed.attempts ?? []) as AttemptRecord[],
    sessions: (seed.sessions ?? []) as never[],
    misconceptions: (seed.misconceptions ?? []) as never[],
    priors: (seed.priors ?? []) as never[],
    circuits: (seed.circuits ?? []) as never[],
    profile: (seed.profile?.[0] as Profile | undefined) ?? emptyProfile(),
  };

  return {
    ...state,
    async init() {},
    async getProfile() { return state.profile; },
    async saveProfile(p) { state.profile = p; },
    async appendAttempt(a) {
      if (state.attempts.some((x) => x.id === a.id)) throw new Error(`duplicate attempt ${a.id}`);
      state.attempts.push(a);
    },
    async listAttempts() { return [...state.attempts].sort((a, b) => a.at.getTime() - b.at.getTime()); },
    async recordMisconceptions(e) { state.misconceptions.push(...(e as never[])); },
    async listMisconceptionEvents() { return state.misconceptions; },
    async saveSession(s) { state.sessions.push(s as never); },
    async listSessions() { return state.sessions; },
    async savePriors(p) { state.priors.push(...(p as never[])); },
    async listPriors() { return state.priors; },
    async saveCircuit(c) { state.circuits.push(c as never); },
    async listCircuits() { return state.circuits; },
    async deleteCircuit() {},
    async reset() {},
    get attempts() { return state.attempts; },
    get profile() { return state.profile; },
  } as StorageAdapter & { attempts: AttemptRecord[]; profile: Profile };
}

const attempt = (id: string, at: string, correct = true): AttemptRecord => ({
  id,
  sessionId: 's1',
  itemId: `item-${id}`,
  kcRefs: [{ kc: 'ee2300.ohms-law', weight: 1 }],
  correct,
  latencyMs: 4000,
  hintsUsed: 0,
  misconceptions: [],
  at: new Date(at),
});

describe('progress export', () => {
  it('round-trips through JSON with dates intact', async () => {
    const storage = fakeStorage({ attempts: [attempt('a', '2026-10-01T10:00:00Z')] });
    const file = await exportProgress(storage, 'laptop');
    const back = parseProgress(encodeProgress(file));

    expect(back.format).toBe(PROGRESS_FORMAT);
    expect(back.version).toBe(PROGRESS_VERSION);
    // The failure this pins: `at` leaves as a Date and comes back as a string,
    // and nothing downstream notices until a sort or a comparison is wrong.
    expect(back.attempts[0]!.at).toBeInstanceOf(Date);
    expect(back.attempts[0]!.at.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });
});

describe('parseProgress', () => {
  it('rejects a file that is not JSON, by name', () => {
    expect(() => parseProgress('<!doctype html>')).toThrow(/not JSON/);
  });

  it('rejects JSON that is not one of ours', () => {
    expect(() => parseProgress('{"hello":1}')).toThrow(/not an Engineering Trainer progress export/);
  });

  it('refuses a newer format rather than guessing at it', () => {
    const file = JSON.stringify({ format: PROGRESS_FORMAT, version: PROGRESS_VERSION + 1, attempts: [] });
    expect(() => parseProgress(file)).toThrow(/newer version/);
  });

  it('accepts an older format', () => {
    const file = JSON.stringify({ format: PROGRESS_FORMAT, version: 1, attempts: [] });
    expect(parseProgress(file).attempts).toEqual([]);
  });
});

describe('importProgress', () => {
  it('adds what is new and leaves what is already there', async () => {
    const mine = fakeStorage({ attempts: [attempt('a', '2026-10-01T10:00:00Z')] });
    const theirs = fakeStorage({
      attempts: [attempt('a', '2026-10-01T10:00:00Z'), attempt('b', '2026-10-02T10:00:00Z')],
    });

    const summary = await importProgress(mine, await exportProgress(theirs, 'desktop'));
    expect(summary.attemptsAdded).toBe(1);
    expect(summary.attemptsAlreadyHere).toBe(1);
    expect((await mine.listAttempts()).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('is idempotent, so exporting after every session is safe', async () => {
    const mine = fakeStorage();
    const theirs = fakeStorage({ attempts: [attempt('a', '2026-10-01T10:00:00Z')] });
    const file = await exportProgress(theirs, 'desktop');

    await importProgress(mine, file);
    const second = await importProgress(mine, parseProgress(encodeProgress(file)));

    expect(second.attemptsAdded).toBe(0);
    expect((await mine.listAttempts())).toHaveLength(1);
  });

  // The property that makes carrying one file back and forth all semester work.
  it('converges when carried in both directions', async () => {
    const laptop = fakeStorage({ attempts: [attempt('L', '2026-10-01T10:00:00Z')] });
    const desktop = fakeStorage({ attempts: [attempt('D', '2026-10-02T10:00:00Z')] });

    await importProgress(laptop, await exportProgress(desktop, 'desktop'));
    await importProgress(desktop, await exportProgress(laptop, 'laptop'));

    const ids = async (s: StorageAdapter): Promise<string[]> =>
      (await s.listAttempts()).map((a) => a.id).sort();
    expect(await ids(laptop)).toEqual(['D', 'L']);
    expect(await ids(desktop)).toEqual(['D', 'L']);
  });
});

describe('mergeProfiles', () => {
  const base = (over: Partial<Profile>): Profile => ({ ...emptyProfile(), ...over });

  it('takes the higher XP rather than the sum', () => {
    // Summing is the intuitive answer and inflates on every repeated import,
    // because the two files share most of their history.
    const merged = mergeProfiles(base({ totalXp: 400 }), base({ totalXp: 900 }));
    expect(merged.totalXp).toBe(900);
    expect(mergeProfiles(merged, base({ totalXp: 900 })).totalXp).toBe(900);
  });

  it('unions crests and completed courses', () => {
    const merged = mergeProfiles(
      base({ crests: ['EE2300'], completedCourses: [{ code: 'EE2300', grade: 'A', completedAt: '2026-05-01' }] }),
      base({ crests: ['MATH2358'], completedCourses: [{ code: 'MATH2358', grade: 'B', completedAt: '2025-12-01' }] }),
    );
    expect(merged.crests.sort()).toEqual(['EE2300', 'MATH2358']);
    expect(merged.completedCourses).toHaveLength(2);
  });

  it('keeps the earlier completion date, which is the one that seeds retention', () => {
    const merged = mergeProfiles(
      base({ completedCourses: [{ code: 'EE2300', grade: 'A', completedAt: '2026-05-01' }] }),
      base({ completedCourses: [{ code: 'EE2300', grade: 'A', completedAt: '2024-05-01' }] }),
    );
    expect(merged.completedCourses[0]!.completedAt).toBe('2024-05-01');
  });

  it('keeps the longer streak and the later active day', () => {
    const merged = mergeProfiles(
      base({ streak: { ...emptyStreak(), current: 3, longest: 9, lastActiveDay: '2026-10-01' } }),
      base({ streak: { ...emptyStreak(), current: 5, longest: 4, lastActiveDay: '2026-10-07' } }),
    );
    expect(merged.streak).toMatchObject({ current: 5, longest: 9, lastActiveDay: '2026-10-07' });
  });

  it('does not make an onboarded learner onboard again', () => {
    expect(mergeProfiles(base({ onboarded: false }), base({ onboarded: true })).onboarded).toBe(true);
  });
});
