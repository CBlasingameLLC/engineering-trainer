-- Saved circuits, and the progression state the gamification layer needs.
--
-- Added as a second migration rather than folded into 001 so an existing
-- database upgrades in place. Nothing derived is stored: streak and crest state
-- are records of events (days worked, exams passed), not projections of the
-- mastery model, which is why they live here rather than being replayed.

CREATE TABLE IF NOT EXISTS circuits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  schematic  TEXT NOT NULL,
  netlist    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS circuits_updated ON circuits(updated_at);

-- Streak bookkeeping. `streak_days` in 001 held only the current count, which
-- cannot express a freeze or a personal best.
ALTER TABLE profile ADD COLUMN streak_longest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN streak_last_day TEXT;
ALTER TABLE profile ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 0;

-- Courses whose challenge exam has been passed.
ALTER TABLE profile ADD COLUMN crests TEXT NOT NULL DEFAULT '[]';
