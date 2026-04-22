-- Create table for shortened links with a visit counter.
CREATE TABLE IF NOT EXISTS links (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	short_code TEXT NOT NULL UNIQUE,
	original_url TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	visit_count INTEGER NOT NULL DEFAULT 0
);

-- Helpful index for fast lookups by short code.
CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
