ALTER TABLE videos ADD COLUMN auto_review_queued_at TEXT;
ALTER TABLE videos ADD COLUMN auto_reviewed_at TEXT;

CREATE TABLE IF NOT EXISTS catalog_auto_review_usage (
  usage_date TEXT PRIMARY KEY,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  scanned_video_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_auto_review_queue
  ON videos(review_status, metadata_checked_at, auto_reviewed_at, auto_review_queued_at, duration_seconds);
