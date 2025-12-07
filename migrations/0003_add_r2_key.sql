-- R2ストレージ統合: r2_keyカラムを追加
ALTER TABLE files ADD COLUMN r2_key TEXT;

-- r2_key検索用のインデックス
CREATE INDEX IF NOT EXISTS idx_files_r2_key ON files(r2_key);

