-- 担当プロジェクトの達成日時（NULL = 未達成、設定済み = 達成済み一覧へ）
ALTER TABLE member_projects ADD COLUMN achieved_at TEXT;
CREATE INDEX IF NOT EXISTS idx_member_projects_user_achieved ON member_projects(user_id, achieved_at);
