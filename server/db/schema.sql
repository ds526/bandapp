-- BandList schema

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT,
  song_key TEXT,           -- e.g. "G", "A minor" (KEY is a reserved word, avoid it)
  time_signature TEXT,     -- e.g. "4/4", "6/8"
  tempo_bpm INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed'  -- proposed | learning | learned | shelved
    CHECK (status IN ('proposed', 'learning', 'learned', 'shelved')),
  notes TEXT,
  submitted_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  date_added TEXT NOT NULL DEFAULT (datetime('now')),
  date_learned TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(song_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_song ON votes(song_id);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
