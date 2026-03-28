-- API keys table (APIキー管理)
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subproject_id INTEGER NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subproject_id) REFERENCES subprojects(id) ON DELETE CASCADE,
  UNIQUE(user_id, subproject_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_subproject_id ON api_keys(subproject_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash);

