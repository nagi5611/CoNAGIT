-- ファイルにパスとタイプを追加
ALTER TABLE files ADD COLUMN path TEXT DEFAULT '/';
ALTER TABLE files ADD COLUMN file_type TEXT DEFAULT 'file'; -- 'file' or 'folder'
ALTER TABLE files ADD COLUMN file_size INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN mime_type TEXT;

-- パス検索用のインデックス
CREATE INDEX IF NOT EXISTS idx_files_path ON files(subproject_id, path);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);
