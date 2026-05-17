-- Media pipeline: track raw S3 pair + processing state (local SQLite per ADR 0007).
CREATE TABLE IF NOT EXISTS media_pipeline_object (
  upload_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending_put',
  video_content_type TEXT,
  thumb_content_type TEXT,
  video_bytes INTEGER,
  thumb_bytes INTEGER,
  error_code TEXT,
  error_detail TEXT,
  r2_thumb_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thumb_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS media_pipeline_object_video_key
  ON media_pipeline_object (video_key);

CREATE INDEX IF NOT EXISTS media_pipeline_object_upload_id
  ON media_pipeline_object (upload_id);

CREATE INDEX IF NOT EXISTS media_pipeline_object_state
  ON media_pipeline_object (state);
