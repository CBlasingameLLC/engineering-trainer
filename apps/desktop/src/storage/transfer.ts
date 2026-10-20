import type {
  AttemptRecord,
  CircuitRecord,
  CompletedCourse,
  InferredPrior,
  MisconceptionEvent,
  Profile,
  SessionRecord,
  StorageAdapter,
} from './types';

/**
 * Carry a learner's progress between machines as one file.
 *
 * This is possible at all because of a decision made much earlier: attempts are
 * append-only and every ability, belief and retention figure is a projection
 * replayed from them. So a transfer does not have to move a model — there is no
 * model to move. It moves evidence, and the far end recomputes. That is also
 * why merging is well defined rather than a judgement call: the union of two
 * append-only logs is an append-only log, and replaying it gives the same
 * answer whichever order the two machines are carried in.
 *
 * Written against `StorageAdapter`, so it works identically over SQLite on the
 * desktop and IndexedDB in the browser without knowing which it has.
 */

export const PROGRESS_FORMAT = 'engineering-trainer/progress';

/**
 * Bump only for a change a previous importer could not read correctly.
 *
 * The import refuses a higher version rather than guessing, because the failure
 * mode of guessing is a silently incomplete learning history, which looks
 * exactly like having done less work.
 */
export const PROGRESS_VERSION = 1;

export interface ProgressFile {
  format: typeof PROGRESS_FORMAT;
  version: number;
  exportedAt: string;
  /** Free-text note about where this came from, for when there are three of them in a folder. */
  origin: string;
  profile: Profile;
  attempts: AttemptRecord[];
  sessions: SessionRecord[];
  misconceptions: MisconceptionEvent[];
  priors: InferredPrior[];
  circuits: CircuitRecord[];
}

export interface ImportSummary {
  attemptsAdded: number;
  attemptsAlreadyHere: number;
  sessionsAdded: number;
  misconceptionsAdded: number;
  priorsAdded: number;
  circuitsAdded: number;
  xpBefore: number;
  xpAfter: number;
  exportedAt: string;
  origin: string;
}

export async function exportProgress(
  storage: StorageAdapter,
  origin: string,
): Promise<ProgressFile> {
  const [profile, attempts, sessions, misconceptions, priors, circuits] = await Promise.all([
    storage.getProfile(),
    storage.listAttempts(),
    storage.listSessions(),
    storage.listMisconceptionEvents(),
    storage.listPriors(),
    storage.listCircuits(),
  ]);

  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    exportedAt: new Date().toISOString(),
    origin,
    profile,
    attempts,
    sessions,
    misconceptions,
    priors,
    circuits,
  };
}

/** Serialise for download. Indented, because a progress file is something a person may want to read. */
export const encodeProgress = (file: ProgressFile): string => JSON.stringify(file, null, 2);

/**
 * Read a file back, refusing anything that is not one of ours.
 *
 * Errors name the actual problem. "Unexpected token < in JSON" when someone
 * picked an HTML file by mistake is a true statement that helps nobody.
 */
export function parseProgress(text: string): ProgressFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('That file is not JSON. Pick the .json file the export produced.');
  }
  if (typeof raw !== 'object' || raw === null) return fail('That file is not a progress export.');

  const file = raw as Partial<ProgressFile>;
  if (file.format !== PROGRESS_FORMAT) {
    return fail('That file is not an Engineering Trainer progress export.');
  }
  if (typeof file.version !== 'number' || file.version > PROGRESS_VERSION) {
    return fail(
      `That file was written by a newer version of the app (format ${String(file.version)}; this one reads ${PROGRESS_VERSION}). Update this machine first.`,
    );
  }
  if (!Array.isArray(file.attempts)) return fail('That export has no attempt log in it.');

  return {
    format: PROGRESS_FORMAT,
    version: file.version,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    origin: typeof file.origin === 'string' ? file.origin : 'unknown',
    profile: file.profile as Profile,
    // `at` is a Date on the way out and a string on the way back, which is the
    // oldest bug in JSON round-tripping and silently sorts the whole log wrong
    // if it is missed: `a.at.getTime()` on a string throws, and a comparison
    // against one does not.
    attempts: file.attempts.map((a) => ({ ...a, at: new Date(a.at) })),
    sessions: Array.isArray(file.sessions) ? file.sessions : [],
    misconceptions: Array.isArray(file.misconceptions) ? file.misconceptions : [],
    priors: Array.isArray(file.priors) ? file.priors : [],
    circuits: Array.isArray(file.circuits) ? file.circuits : [],
  };
}

const fail = (message: string): never => {
  throw new Error(message);
};

/**
 * Merge an export into whatever is already here.
 *
 * Union everywhere, de-duplicated by id. Nothing local is ever discarded, so
 * carrying the file in both directions converges rather than ping-ponging, and
 * importing the same file twice is a no-op — which matters, because the obvious
 * way to use this is to export after every session and not keep track of which
 * ones have been applied.
 */
export async function importProgress(
  storage: StorageAdapter,
  file: ProgressFile,
): Promise<ImportSummary> {
  const [localProfile, localAttempts, localSessions, localMisconceptions, localPriors, localCircuits] =
    await Promise.all([
      storage.getProfile(),
      storage.listAttempts(),
      storage.listSessions(),
      storage.listMisconceptionEvents(),
      storage.listPriors(),
      storage.listCircuits(),
    ]);

  // `appendAttempt` is `add`, not `put` — an id collision is meant to surface
  // loudly because it would otherwise overwrite recorded evidence. So the
  // filtering has to happen here rather than being left to the store.
  const haveAttempt = new Set(localAttempts.map((a) => a.id));
  const newAttempts = file.attempts.filter((a) => !haveAttempt.has(a.id));
  for (const attempt of newAttempts) await storage.appendAttempt(attempt);

  const haveSession = new Set(localSessions.map((s) => s.id));
  const newSessions = file.sessions.filter((s) => !haveSession.has(s.id));
  for (const session of newSessions) await storage.saveSession(session);

  const haveMisconception = new Set(localMisconceptions.map((m) => m.id));
  const newMisconceptions = file.misconceptions.filter((m) => !haveMisconception.has(m.id));
  if (newMisconceptions.length > 0) await storage.recordMisconceptions(newMisconceptions);

  // Priors are conclusions rather than evidence, and the next placement rewrites
  // them anyway. Keep the more recent of the two so the dashboard is not blank
  // on a machine that has never run one.
  const priorByKc = new Map(localPriors.map((p) => [p.kcId, p]));
  const newPriors = file.priors.filter((p) => {
    const mine = priorByKc.get(p.kcId);
    return !mine || mine.recordedAt < p.recordedAt;
  });
  if (newPriors.length > 0) await storage.savePriors(newPriors);

  const haveCircuit = new Set(localCircuits.map((c) => c.id));
  const newCircuits = file.circuits.filter((c) => !haveCircuit.has(c.id));
  for (const circuit of newCircuits) await storage.saveCircuit(circuit);

  const merged = mergeProfiles(localProfile, file.profile);
  await storage.saveProfile(merged);

  return {
    attemptsAdded: newAttempts.length,
    attemptsAlreadyHere: file.attempts.length - newAttempts.length,
    sessionsAdded: newSessions.length,
    misconceptionsAdded: newMisconceptions.length,
    priorsAdded: newPriors.length,
    circuitsAdded: newCircuits.length,
    xpBefore: localProfile.totalXp,
    xpAfter: merged.totalXp,
    exportedAt: file.exportedAt,
    origin: file.origin,
  };
}

/**
 * Combine two profiles.
 *
 * A profile is the one thing here that is not a log, so it cannot be merged by
 * union and has to be decided field by field. The rule throughout is whichever
 * choice is *idempotent*: importing the same file twice has to leave the same
 * profile, or an export-after-every-session habit inflates the numbers without
 * anyone noticing.
 *
 * So XP takes the maximum rather than the sum. Summing is the intuitive answer
 * and is wrong twice over — it double-counts every session whose attempts are
 * in both files, and it grows on a repeated import of the same file. The
 * maximum under-counts work genuinely done on two machines in parallel, which
 * is the smaller and more honest error: XP is a motivational number, and the
 * measurement the app exists to make is replayed from the attempt log, which
 * *is* merged exactly.
 */
export function mergeProfiles(mine: Profile, theirs: Profile | undefined): Profile {
  if (!theirs) return mine;

  const courses = new Map<string, CompletedCourse>();
  for (const course of [...theirs.completedCourses, ...mine.completedCourses]) {
    const existing = courses.get(course.code);
    // The earlier date is the true one: a course does not finish twice, and the
    // completion date seeds the retention model, where a later date would claim
    // the material is fresher than it is.
    if (!existing || course.completedAt < existing.completedAt) courses.set(course.code, course);
  }

  const lastActiveDay = [mine.streak.lastActiveDay, theirs.streak.lastActiveDay]
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1) ?? null;

  return {
    completedCourses: [...courses.values()],
    targetTerm: mine.targetTerm || theirs.targetTerm,
    totalXp: Math.max(mine.totalXp, theirs.totalXp),
    streak: {
      // The streak counts days the learner showed up, and they showed up on
      // both machines. Taking the larger of each is the only choice that does
      // not punish owning two computers.
      current: Math.max(mine.streak.current, theirs.streak.current),
      longest: Math.max(mine.streak.longest, theirs.streak.longest),
      lastActiveDay,
      freezes: Math.max(mine.streak.freezes, theirs.streak.freezes),
    },
    crests: [...new Set([...mine.crests, ...theirs.crests])],
    lastActiveAt: [mine.lastActiveAt, theirs.lastActiveAt]
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null,
    // Onboarding is a thing that happened, not a setting. If it happened
    // anywhere it does not need to happen again.
    onboarded: mine.onboarded || theirs.onboarded,
  };
}
