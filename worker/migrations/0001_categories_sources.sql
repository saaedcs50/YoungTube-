CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_categories (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🌟', description TEXT NOT NULL DEFAULT '',
 category_type TEXT NOT NULL CHECK(category_type IN ('center','opt_in','video_variant','custom')),
 scope TEXT NOT NULL CHECK(scope IN ('source','video','both')), source_selectable INTEGER NOT NULL DEFAULT 0,
 requires_family_opt_in INTEGER NOT NULL DEFAULT 0, launch_tier TEXT NOT NULL DEFAULT 'P1', taxonomy_version TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS category_aliases (alias_id TEXT PRIMARY KEY, canonical_category_id TEXT, alias_kind TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(canonical_category_id) REFERENCES content_categories(id));
CREATE TABLE IF NOT EXISTS sources (
 source_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT,
 source_class TEXT NOT NULL DEFAULT 'CURATED', default_category_hints_json TEXT NOT NULL DEFAULT '[]',
 ingest_mode TEXT NOT NULL DEFAULT 'RECENT_ONLY', source_status TEXT NOT NULL DEFAULT 'ACTIVE', history_depth_limit INTEGER,
 page_token TEXT, last_successful_scan_at TEXT, last_discovered_at TEXT, next_scan_at TEXT, acceptance_rate REAL,
 failure_rate REAL, metadata_checked_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
