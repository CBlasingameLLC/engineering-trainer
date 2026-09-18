/**
 * Daily streaks, with earned freezes.
 *
 * A streak is a commitment device, and its failure mode is well known: one
 * missed day destroys a long streak, the learner feels the loss is unrecoverable
 * and stops entirely. Freezes exist to absorb that — but they are *earned* by
 * sustained work rather than handed out or sold, so the mechanic still rewards
 * the behaviour it is supposed to encourage.
 */

export interface StreakState {
  current: number;
  longest: number;
  /** Calendar day of the last qualifying session, "YYYY-MM-DD". */
  lastActiveDay: string | null;
  /** Unspent freezes. Each covers one missed day. */
  freezes: number;
}

export interface StreakParams {
  /** Consecutive days of work that earn one freeze. */
  daysPerFreeze: number;
  /** Cap on stockpiled freezes, so a long streak cannot buy indefinite absence. */
  maxFreezes: number;
}

export const DEFAULT_STREAK_PARAMS: StreakParams = { daysPerFreeze: 7, maxFreezes: 3 };

export const emptyStreak = (): StreakState => ({
  current: 0,
  longest: 0,
  lastActiveDay: null,
  freezes: 0,
});

/** Calendar day key in the runtime's local zone — the day the learner experienced. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days between two day keys. Negative if `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  const parse = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export interface StreakUpdate {
  state: StreakState;
  /** What happened, for the interface to explain rather than just animate. */
  outcome: 'continued' | 'extended' | 'already-done-today' | 'frozen' | 'broken' | 'started';
  /** Freezes spent covering missed days. */
  freezesSpent: number;
  /** Freezes earned by reaching a multiple of `daysPerFreeze`. */
  freezesEarned: number;
}

/**
 * Record a qualifying session on `today`.
 *
 * Missed days are covered by freezes if there are enough; otherwise the streak
 * resets. Both paths are reported so the UI can say which happened — silently
 * consuming a freeze is the kind of thing that makes a mechanic feel arbitrary.
 */
export function recordActivity(
  state: StreakState,
  today: Date,
  params: StreakParams = DEFAULT_STREAK_PARAMS,
): StreakUpdate {
  const key = dayKey(today);

  if (state.lastActiveDay === null) {
    const next = { ...state, current: 1, longest: Math.max(state.longest, 1), lastActiveDay: key };
    return { state: next, outcome: 'started', freezesSpent: 0, freezesEarned: 0 };
  }

  const gap = daysBetween(state.lastActiveDay, key);

  if (gap <= 0) {
    // Same day (or a clock that went backwards). Already counted.
    return { state, outcome: 'already-done-today', freezesSpent: 0, freezesEarned: 0 };
  }

  let current: number;
  let freezesSpent = 0;
  let outcome: StreakUpdate['outcome'];

  if (gap === 1) {
    current = state.current + 1;
    outcome = 'extended';
  } else {
    const missed = gap - 1;
    if (missed <= state.freezes) {
      freezesSpent = missed;
      current = state.current + 1;
      outcome = 'frozen';
    } else {
      freezesSpent = 0;
      current = 1;
      outcome = 'broken';
    }
  }

  // Freezes accrue on crossing each multiple of the threshold, not per day.
  const crossed =
    Math.floor(current / params.daysPerFreeze) - Math.floor((current - 1) / params.daysPerFreeze);
  const freezesEarned = outcome === 'broken' ? 0 : Math.max(0, crossed);

  const freezes = Math.min(params.maxFreezes, state.freezes - freezesSpent + freezesEarned);

  return {
    state: {
      current,
      longest: Math.max(state.longest, current),
      lastActiveDay: key,
      freezes: Math.max(0, freezes),
    },
    outcome,
    freezesSpent,
    freezesEarned,
  };
}

/**
 * The streak as it stands today, without recording activity.
 *
 * A streak shown on the dashboard has to account for days already missed, or it
 * reads as intact right up until the moment the learner opens a session and
 * discovers it was not.
 */
export function streakAsOf(
  state: StreakState,
  today: Date,
  params: StreakParams = DEFAULT_STREAK_PARAMS,
): { current: number; atRisk: boolean; freezesAvailable: number } {
  if (state.lastActiveDay === null) {
    return { current: 0, atRisk: false, freezesAvailable: state.freezes };
  }

  const gap = daysBetween(state.lastActiveDay, dayKey(today));
  if (gap <= 0) return { current: state.current, atRisk: false, freezesAvailable: state.freezes };
  if (gap === 1) {
    // Worked yesterday, nothing yet today: intact but expiring at midnight.
    return { current: state.current, atRisk: true, freezesAvailable: state.freezes };
  }

  const missed = gap - 1;
  if (missed <= state.freezes) {
    return { current: state.current, atRisk: true, freezesAvailable: state.freezes - missed };
  }
  void params;
  return { current: 0, atRisk: false, freezesAvailable: state.freezes };
}
