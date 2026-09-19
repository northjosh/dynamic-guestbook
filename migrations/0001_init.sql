CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  address TEXT NOT NULL,
  signature TEXT NOT NULL,
  verified INTEGER NOT NULL, -- 0 or 1, recomputed server-side on write
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX entries_created_at_idx ON entries (created_at DESC);
