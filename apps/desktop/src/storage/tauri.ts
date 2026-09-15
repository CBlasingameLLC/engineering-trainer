import {
  emptyProfile,
  type AttemptRecord,
  type InferredPrior,
  type MisconceptionEvent,
  type Profile,
  type SessionRecord,
  type StorageAdapter,
} from './types.js';

/**
 * SQLite-backed storage for the desktop build.
 *
 * Mirrors WebStorageAdapter exactly, so the renderer never knows which one it
 * is talking to. The plugin is imported dynamically because `@tauri-apps/plugin-sql`
 * has no meaning in a plain browser, and a static import would break the web
 * build that the whole verification story depends on.
 *
 * Schema and migrations live in `src-tauri/migrations/001_initial.sql` and are
 * applied by the Rust side at startup.
 */

interface SqlDatabase {
  execute(query: string, values?: unknown[]): Promise<unknown>;
  select<T>(query: string, values?: unknown[]): Promise<T>;
}

export class TauriSqlAdapter implements StorageAdapter {
  readonly kind = 'tauri' as const;
  private db: SqlDatabase | null = null;

  async init(): Promise<void> {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    this.db = (await Database.load('sqlite:trainer.db')) as unknown as SqlDatabase;
  }

  private get database(): SqlDatabase {
    if (!this.db) throw new Error('TauriSqlAdapter: init() was not awaited');
    return this.db;
  }

  async getProfile(): Promise<Profile> {
    const rows = await this.database.select<
      { completed_courses: string; target_term: string; total_xp: number; streak_days: number; last_active_at: string | null; onboarded: number }[]
    >('SELECT * FROM profile WHERE id = 1');

    const row = rows[0];
    if (!row) return emptyProfile();
    return {
      completedCourses: JSON.parse(row.completed_courses),
      targetTerm: row.target_term,
      totalXp: row.total_xp,
      streakDays: row.streak_days,
      lastActiveAt: row.last_active_at,
      onboarded: row.onboarded === 1,
    };
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.database.execute(
      `UPDATE profile SET completed_courses = $1, target_term = $2, total_xp = $3,
                          streak_days = $4, last_active_at = $5, onboarded = $6
       WHERE id = 1`,
      [
        JSON.stringify(profile.completedCourses),
        profile.targetTerm,
        profile.totalXp,
        profile.streakDays,
        profile.lastActiveAt,
        profile.onboarded ? 1 : 0,
      ],
    );
  }

  async appendAttempt(attempt: AttemptRecord): Promise<void> {
    // No ON CONFLICT clause: attempts are append-only, and a duplicate id means
    // a logic error upstream that should surface rather than overwrite evidence.
    await this.database.execute(
      `INSERT INTO attempts (id, session_id, item_id, kc_refs, correct, latency_ms, hints_used, option_count, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        attempt.id,
        attempt.sessionId,
        attempt.itemId,
        JSON.stringify(attempt.kcRefs),
        attempt.correct ? 1 : 0,
        attempt.latencyMs,
        attempt.hintsUsed,
        attempt.optionCount ?? null,
        attempt.at.toISOString(),
      ],
    );
  }

  async listAttempts(): Promise<AttemptRecord[]> {
    const rows = await this.database.select<
      { id: string; session_id: string; item_id: string; kc_refs: string; correct: number; latency_ms: number; hints_used: number; option_count: number | null; at: string }[]
    >('SELECT * FROM attempts ORDER BY at ASC');

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      itemId: row.item_id,
      kcRefs: JSON.parse(row.kc_refs),
      correct: row.correct === 1,
      latencyMs: row.latency_ms,
      hintsUsed: row.hints_used,
      misconceptions: [],
      at: new Date(row.at),
      ...(row.option_count !== null ? { optionCount: row.option_count } : {}),
    }));
  }

  async recordMisconceptions(events: MisconceptionEvent[]): Promise<void> {
    for (const event of events) {
      await this.database.execute(
        `INSERT OR REPLACE INTO misconception_events (id, misconception_id, kc_id, attempt_id, at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, event.misconceptionId, event.kcId, event.attemptId, event.at],
      );
    }
  }

  async listMisconceptionEvents(): Promise<MisconceptionEvent[]> {
    const rows = await this.database.select<
      { id: string; misconception_id: string; kc_id: string; attempt_id: string; at: string }[]
    >('SELECT * FROM misconception_events ORDER BY at ASC');

    return rows.map((row) => ({
      id: row.id,
      misconceptionId: row.misconception_id,
      kcId: row.kc_id,
      attemptId: row.attempt_id,
      at: row.at,
    }));
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.database.execute(
      `INSERT OR REPLACE INTO sessions (id, mode, course_ids, started_at, ended_at, xp_earned, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.mode,
        JSON.stringify(session.courseIds),
        session.startedAt,
        session.endedAt,
        session.xpEarned,
        JSON.stringify(session.summary),
      ],
    );
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await this.database.select<
      { id: string; mode: string; course_ids: string; started_at: string; ended_at: string | null; xp_earned: number; summary: string | null }[]
    >('SELECT * FROM sessions ORDER BY started_at DESC');

    return rows.map((row) => ({
      id: row.id,
      mode: row.mode as SessionRecord['mode'],
      courseIds: JSON.parse(row.course_ids),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      xpEarned: row.xp_earned,
      summary: row.summary ? JSON.parse(row.summary) : null,
    }));
  }

  async savePriors(priors: InferredPrior[]): Promise<void> {
    for (const prior of priors) {
      await this.database.execute(
        `INSERT OR REPLACE INTO inferred_priors (kc_id, prior, source_kc_id, distance, recorded_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [prior.kcId, prior.prior, prior.sourceKcId, prior.distance, prior.recordedAt],
      );
    }
  }

  async listPriors(): Promise<InferredPrior[]> {
    const rows = await this.database.select<
      { kc_id: string; prior: number; source_kc_id: string; distance: number; recorded_at: string }[]
    >('SELECT * FROM inferred_priors');

    return rows.map((row) => ({
      kcId: row.kc_id,
      prior: row.prior,
      sourceKcId: row.source_kc_id,
      distance: row.distance,
      recordedAt: row.recorded_at,
    }));
  }

  async reset(): Promise<void> {
    // Order matters: children before the rows they reference.
    for (const table of ['misconception_events', 'attempts', 'sessions', 'inferred_priors']) {
      await this.database.execute(`DELETE FROM ${table}`);
    }
    await this.database.execute(
      `UPDATE profile SET completed_courses = '[]', target_term = '', total_xp = 0,
                          streak_days = 0, last_active_at = NULL, onboarded = 0
       WHERE id = 1`,
    );
  }
}

/** True when running inside the Tauri shell rather than a plain browser. */
export const isTauri = (): boolean =>
  typeof globalThis === 'object' && '__TAURI_INTERNALS__' in globalThis;
