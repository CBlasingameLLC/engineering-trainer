import type { Attempt, CourseId, KcId, MisconceptionId } from '@et/domain';
import type { CourseGrade } from '@et/domain';

/**
 * Persistence contract.
 *
 * Two implementations sit behind this: SQLite through the Tauri shim on the
 * desktop, and IndexedDB in a plain browser. Keeping the renderer against an
 * interface rather than either one means the whole app can be run and verified
 * in a browser without a Tauri toolchain, and the desktop build is packaging
 * rather than a separate codebase.
 */

export interface AttemptRecord extends Attempt {
  id: string;
  sessionId: string;
}

export interface CompletedCourse {
  code: CourseId;
  grade: CourseGrade;
  /** When the course ended. Seeds the retention model - see seedFromCourseCompletion. */
  completedAt: string;
}

export interface Profile {
  completedCourses: CompletedCourse[];
  /** The term being prepared for, e.g. "2026 Fall". */
  targetTerm: string;
  totalXp: number;
  streakDays: number;
  lastActiveAt: string | null;
  onboarded: boolean;
}

export type SessionMode = 'placement' | 'practice' | 'review' | 'challenge';

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  courseIds: CourseId[];
  startedAt: string;
  endedAt: string | null;
  xpEarned: number;
  /** Serialised placement result, for re-rendering a gap report without replay. */
  summary: unknown;
}

/**
 * Priors inferred from the prerequisite graph rather than measured directly.
 * Stored separately from attempts because they are conclusions, not evidence -
 * keeping them apart is what lets the learner model be recomputed from the log
 * alone when the mastery parameters change.
 */
export interface InferredPrior {
  kcId: KcId;
  prior: number;
  sourceKcId: KcId;
  distance: number;
  recordedAt: string;
}

export interface MisconceptionEvent {
  id: string;
  misconceptionId: MisconceptionId;
  kcId: KcId;
  attemptId: string;
  at: string;
}

export interface StorageAdapter {
  readonly kind: 'web' | 'tauri';
  init(): Promise<void>;

  getProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;

  /** Append-only. Attempts are never updated or deleted. */
  appendAttempt(attempt: AttemptRecord): Promise<void>;
  listAttempts(): Promise<AttemptRecord[]>;

  recordMisconceptions(events: MisconceptionEvent[]): Promise<void>;
  listMisconceptionEvents(): Promise<MisconceptionEvent[]>;

  saveSession(session: SessionRecord): Promise<void>;
  listSessions(): Promise<SessionRecord[]>;

  savePriors(priors: InferredPrior[]): Promise<void>;
  listPriors(): Promise<InferredPrior[]>;

  /** Wipe everything. Used by "start over" and by tests. */
  reset(): Promise<void>;
}

export const emptyProfile = (): Profile => ({
  completedCourses: [],
  targetTerm: '',
  totalXp: 0,
  streakDays: 0,
  lastActiveAt: null,
  onboarded: false,
});
