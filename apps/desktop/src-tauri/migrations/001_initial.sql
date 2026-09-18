-- Learner database.
--
-- `attempts` is the source of truth and is never updated or deleted. Mastery
-- state is a projection rebuilt by replaying it, which is what allows the model
-- parameters to be retuned against real history rather than frozen at whatever
-- the original ones concluded.

CREATE TABLE IF NOT EXISTS profile (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  completed_courses TEXT    NOT NULL DEFAULT '[]',
  target_term       TEXT    NOT NULL DEFAULT '',
  total_xp          INTEGER NOT NULL DEFAULT 0,
  streak_days       INTEGER NOT NULL DEFAULT 0,
  last_active_at    TEXT,
  onboarded         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  mode       TEXT NOT NULL,
  course_ids TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  xp_earned  INTEGER NOT NULL DEFAULT 0,
  summary    TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  item_id      TEXT NOT NULL,
  kc_refs      TEXT NOT NULL,
  correct      INTEGER NOT NULL,
  latency_ms   INTEGER NOT NULL,
  hints_used   INTEGER NOT NULL DEFAULT 0,
  option_count INTEGER,
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_at ON attempts(at);
CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_id);

CREATE TABLE IF NOT EXISTS misconception_events (
  id               TEXT PRIMARY KEY,
  misconception_id TEXT NOT NULL,
  kc_id            TEXT NOT NULL,
  attempt_id       TEXT NOT NULL REFERENCES attempts(id),
  at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS misconceptions_by_id ON misconception_events(misconception_id);

-- Conclusions drawn through the prerequisite graph, kept apart from the
-- evidence that produced them so a replay can distinguish the two.
CREATE TABLE IF NOT EXISTS inferred_priors (
  kc_id        TEXT PRIMARY KEY,
  prior        REAL NOT NULL,
  source_kc_id TEXT NOT NULL,
  distance     INTEGER NOT NULL,
  recorded_at  TEXT NOT NULL
);

-- Imported packs beyond those bundled with the build. license_tier is carried
-- through so personal-only content stays identifiable at rest.
CREATE TABLE IF NOT EXISTS imported_packs (
  pack_id       TEXT PRIMARY KEY,
  course        TEXT NOT NULL,
  title         TEXT NOT NULL,
  license_tier  TEXT NOT NULL,
  payload       TEXT NOT NULL,
  imported_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circuits (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  schematic     TEXT NOT NULL,
  netlist       TEXT,
  updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO profile (id) VALUES (1);
