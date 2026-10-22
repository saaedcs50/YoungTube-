ALTER TABLE videos ADD COLUMN metadata_refresh_queued_at TEXT;
CREATE INDEX IF NOT EXISTS idx_videos_metadata_refresh ON videos(metadata_checked_at, metadata_refresh_queued_at, review_status);
