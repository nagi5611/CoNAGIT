import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== 認証 API ====================

// ログイン
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json()
  
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).bind(username).first()
  
  if (!user) {
    return c.json({ error: 'ユーザーが見つかりません' }, 401)
  }
  
  // 簡易認証（開発用）
  const isValid = password === user.password
  
  if (!isValid) {
    return c.json({ error: 'パスワードが正しくありません' }, 401)
  }
  
  // セッション情報を返す（簡易実装）
  return c.json({ 
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  })
})

// ユーザー登録
app.post('/api/register', async (c) => {
  const { username, password, email } = await c.req.json()
  
  const hashedPassword = password
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, password, email) VALUES (?, ?, ?)'
    ).bind(username, hashedPassword, email).run()
    
    return c.json({ 
      success: true,
      userId: result.meta.last_row_id 
    })
  } catch (error) {
    return c.json({ error: 'ユーザー登録に失敗しました' }, 400)
  }
})

// ==================== プロジェクト API ====================

// プロジェクト一覧取得
app.get('/api/projects', async (c) => {
  const userId = c.req.query('userId')
  
  const projects = await c.env.DB.prepare(`
    SELECT p.*, u.username as created_by_name
    FROM projects p
    JOIN users u ON p.created_by = u.id
    JOIN project_members pm ON p.id = pm.project_id
    WHERE pm.user_id = ?
    ORDER BY p.updated_at DESC
  `).bind(userId).all()
  
  return c.json(projects.results)
})

// プロジェクト作成
app.post('/api/projects', async (c) => {
  const { name, description, userId } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)'
  ).bind(name, description, userId).run()
  
  const projectId = result.meta.last_row_id
  
  // 作成者を owner として追加
  await c.env.DB.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).bind(projectId, userId, 'owner').run()
  
  return c.json({ success: true, projectId })
})

// プロジェクト詳細取得
app.get('/api/projects/:id', async (c) => {
  const projectId = c.req.param('id')
  
  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(projectId).first()
  
  return c.json(project)
})

// プロジェクト更新
app.put('/api/projects/:id', async (c) => {
  const projectId = c.req.param('id')
  const { name, description, progress } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE projects SET name = ?, description = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, description, progress, projectId).run()
  
  return c.json({ success: true })
})

// プロジェクト削除
app.delete('/api/projects/:id', async (c) => {
  const projectId = c.req.param('id')
  
  await c.env.DB.prepare(
    'DELETE FROM projects WHERE id = ?'
  ).bind(projectId).run()
  
  return c.json({ success: true })
})

// ==================== プロジェクトメンバー API ====================

// メンバー一覧取得
app.get('/api/projects/:id/members', async (c) => {
  const projectId = c.req.param('id')
  
  const members = await c.env.DB.prepare(`
    SELECT pm.*, u.username, u.email
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).bind(projectId).all()
  
  return c.json(members.results)
})

// メンバー追加
app.post('/api/projects/:id/members', async (c) => {
  const projectId = c.req.param('id')
  const { userId, role } = await c.req.json()
  
  await c.env.DB.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).bind(projectId, userId, role || 'member').run()
  
  return c.json({ success: true })
})

// メンバー削除
app.delete('/api/projects/:projectId/members/:userId', async (c) => {
  const projectId = c.req.param('projectId')
  const userId = c.req.param('userId')
  
  await c.env.DB.prepare(
    'DELETE FROM project_members WHERE project_id = ? AND user_id = ?'
  ).bind(projectId, userId).run()
  
  return c.json({ success: true })
})

// ==================== 子プロジェクト API ====================

// 子プロジェクト一覧取得
app.get('/api/projects/:id/subprojects', async (c) => {
  const projectId = c.req.param('id')
  
  const subprojects = await c.env.DB.prepare(
    'SELECT * FROM subprojects WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(projectId).all()
  
  return c.json(subprojects.results)
})

// 子プロジェクト作成
app.post('/api/projects/:id/subprojects', async (c) => {
  const projectId = c.req.param('id')
  const { name, description } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO subprojects (project_id, name, description) VALUES (?, ?, ?)'
  ).bind(projectId, name, description).run()
  
  return c.json({ success: true, subprojectId: result.meta.last_row_id })
})

// 子プロジェクト削除
app.delete('/api/subprojects/:id', async (c) => {
  const subprojectId = c.req.param('id')
  
  await c.env.DB.prepare(
    'DELETE FROM subprojects WHERE id = ?'
  ).bind(subprojectId).run()
  
  return c.json({ success: true })
})

// ==================== ファイル API ====================

// ファイル一覧取得
app.get('/api/subprojects/:id/files', async (c) => {
  const subprojectId = c.req.param('id')
  
  const files = await c.env.DB.prepare(`
    SELECT f.*, u.username as updated_by_name
    FROM files f
    JOIN users u ON f.updated_by = u.id
    WHERE f.subproject_id = ?
    ORDER BY f.updated_at DESC
  `).bind(subprojectId).all()
  
  return c.json(files.results)
})

// ファイル作成
app.post('/api/subprojects/:id/files', async (c) => {
  const subprojectId = c.req.param('id')
  const { name, content, userId, projectId } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, content, updated_by) VALUES (?, ?, ?, ?)'
  ).bind(subprojectId, name, content, userId).run()
  
  const fileId = result.meta.last_row_id
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${name}を作成しました`).run()
  
  return c.json({ success: true, fileId })
})

// ファイル更新
app.put('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { name, content, userId, projectId } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE files SET name = ?, content = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, content, userId, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'updated', `${name}を更新しました`).run()
  
  return c.json({ success: true })
})

// ファイル削除
app.delete('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { userId, projectId, fileName } = await c.req.json()
  
  await c.env.DB.prepare(
    'DELETE FROM files WHERE id = ?'
  ).bind(fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, null, 'deleted', `${fileName}を削除しました`).run()
  
  return c.json({ success: true })
})

// ファイルダウンロード
app.get('/api/files/:id/download', async (c) => {
  const fileId = c.req.param('id')
  
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  return new Response(file.content as string, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${file.name}"`
    }
  })
})

// ==================== タイムライン API ====================

// タイムライン取得
app.get('/api/projects/:id/timeline', async (c) => {
  const projectId = c.req.param('id')
  
  const timeline = await c.env.DB.prepare(`
    SELECT t.*, u.username, f.name as file_name
    FROM timeline t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN files f ON t.file_id = f.id
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).bind(projectId).all()
  
  return c.json(timeline.results)
})

// ==================== ユーザー検索 API ====================

// ユーザー検索
app.get('/api/users/search', async (c) => {
  const query = c.req.query('q')
  
  const users = await c.env.DB.prepare(
    'SELECT id, username, email FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 10'
  ).bind(`%${query}%`, `%${query}%`).all()
  
  return c.json(users.results)
})

// ==================== ルートページ ====================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Team Project Manager</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
          }
          .border-orange {
            border-color: #ff6b35;
          }
          .text-orange {
            color: #ff6b35;
          }
          .bg-orange {
            background-color: #ff6b35;
          }
          .hover\\:bg-orange-dark:hover {
            background-color: #e5581f;
          }
          .progress-bar {
            transition: width 0.3s ease;
          }
        </style>
    </head>
    <body class="bg-white">
        <div id="app"></div>
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
