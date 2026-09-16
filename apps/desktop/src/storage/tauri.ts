import {
  emptyProfile,
  type AttemptRecord,
  type CircuitRecord,
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
 * is talking to. The plugin is imported dynamically so the browser build never
 * fetches the chunk: the import sits behind `isTauri()` and only the desktop
 * shell ever reaches it.
 *
 * The plugin is a real dependency and is bundled. An earlier version declared it
 * with a local `.d.ts` shim and marked it external in vite.config.ts, which
 * satisfied both the compiler and the bundler while the package was not
 * installed at all - the desktop build then emitted a bare specifier the WebView
 * could not resolve, and hung on startup with no error shown.
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
      {
        completed_courses: string; target_term: string; total_xp: number;
        streak_days: number; streak_longest: number; streak_last_day: string | null;
        streak_freezes: number; crests: string; last_active_at: string | null; onboarded: number;
      }[]
    >('SELECT * FROM profile WHERE id = 1');

    const row = rows[0];
    if (!row) return emptyProfile();
    return {
      completedCourses: JSON.parse(row.completed_courses),
      targetTerm: row.target_term,
      totalXp: row.total_xp,
      streak: {
        current: row.streak_days,
        longest: row.streak_longest,
        lastActiveDay: row.streak_last_day,
        freezes: row.streak_freezes,
      },
      crests: JSON.parse(row.crests),
      lastActiveAt: row.last_active_at,
      onboarded: row.onboarded === 1,
    };
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.database.execute(
      `UPDATE profile SET completed_courses = $1, target_term = $2, total_xp = $3,
                          streak_days = $4, streak_longest = $5, streak_last_day = $6,
                          streak_freezes = $7, crests = $8, last_active_at = $9, onboarded = $10
       WHERE id = 1`,
      [
        JSON.stringify(profile.completedCourses),
        profile.targetTerm,
        profile.totalXp,
        profile.streak.current,
        profile.streak.longest,
        profile.streak.lastActiveDay,
        profile.streak.freezes,
        JSON.stringify(profile.crests),
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

  async saveCircuit(circuit: CircuitRecord): Promise<void> {
    await this.database.execute(
      `INSERT OR REPLACE INTO circuits (id, name, schematic, netlist, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [circuit.id, circuit.name, JSON.stringify(circuit.schematic), circuit.netlist, circuit.updatedAt],
    );
  }

  async listCircuits(): Promise<CircuitRecord[]> {
    const rows = await this.database.select<
      { id: string; name: string; schematic: string; netlist: string; updated_at: string }[]
    >('SELECT * FROM circuits ORDER BY updated_at DESC');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      schematic: JSON.parse(row.schematic),
      netlist: row.netlist,
      updatedAt: row.updated_at,
    }));
  }

  async deleteCircuit(id: string): Promise<void> {
    await this.database.execute('DELETE FROM circuits WHERE id = $1', [id]);
  }

  async reset(): Promise<void> {
    // Order matters: children before the rows they reference.
    for (const table of ['misconception_events', 'attempts', 'sessions', 'inferred_priors', 'circuits']) {
      await this.database.execute(`DELETE FROM ${table}`);
    }
    await this.database.execute(
      `UPDATE profile SET completed_courses = '[]', target_term = '', total_xp = 0,
                          streak_days = 0, streak_longest = 0, streak_last_day = NULL,
                          streak_freezes = 0, crests = '[]', last_active_at = NULL, onboarded = 0
       WHERE id = 1`,
    );
  }
}

/** True when running inside the Tauri shell rather than a plain browser. */
export const isTauri = (): boolean =>
  typeof globalThis === 'object' && '__TAURI_INTERNALS__' in globalThis;
