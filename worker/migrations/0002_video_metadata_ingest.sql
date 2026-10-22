CREATE TABLE IF NOT EXISTS videos (
 video_id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, published_at TEXT, primary_category_id TEXT,
 secondary_tags_json TEXT NOT NULL DEFAULT '[]', format TEXT, age_band TEXT, risk_level TEXT, supervision_required INTEGER NOT NULL DEFAULT 0,
 music_variant TEXT NOT NULL DEFAULT 'STANDARD_OR_UNSPECIFIED', music_classification_json TEXT,
 shorts_check_status TEXT NOT NULL DEFAULT 'SHORTS_UNKNOWN', shorts_check_evidence_json TEXT,
 review_status TEXT NOT NULL DEFAULT 'CANDIDATE', review_reason TEXT, review_evidence_json TEXT, policy_version TEXT,
 reviewed_at TEXT, metadata_checked_at TEXT, last_seen_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 duration_seconds INTEGER, frame_width INTEGER, frame_height INTEGER, shorts_path_signal INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(primary_category_id) REFERENCES content_categories(id)
);
CREATE TABLE IF NOT EXISTS video_sources (video_id TEXT NOT NULL, source_id TEXT NOT NULL, discovered_at TEXT NOT NULL, source_type TEXT NOT NULL, PRIMARY KEY(video_id,source_id), FOREIGN KEY(video_id) REFERENCES videos(video_id) ON DELETE CASCADE, FOREIGN KEY(source_id) REFERENCES sources(source_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ingest_jobs (job_id TEXT PRIMARY KEY, source_id TEXT, job_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'QUEUED', cursor_json TEXT, payload_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, queued_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(source_id) REFERENCES sources(source_id));
CREATE INDEX IF NOT EXISTS idx_sources_status_nextscan ON sources(source_status,next_scan_at);
CREATE INDEX IF NOT EXISTS idx_videos_category_review ON videos(primary_category_id,review_status);
CREATE INDEX IF NOT EXISTS idx_videos_review_shorts ON videos(review_status,shorts_check_status);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_sources_source ON video_sources(source_id,video_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_queued ON ingest_jobs(status,queued_at);
