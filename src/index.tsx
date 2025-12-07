import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_REGION?: string
  S3_BUCKET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// エラーハンドリング
app.onError((err, c) => {
  console.error('Error:', err)
  return c.json({ 
    error: 'Internal Server Error',
    message: err.message,
    stack: err.stack 
  }, 500)
})

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== 認証 API ====================

// ログイン
app.post('/api/login', async (c) => {
  try {
    // DBバインディングの確認
    if (!c.env.DB) {
      console.error('DB binding is not available')
      return c.json({ error: 'データベース接続エラー: DBバインディングが設定されていません' }, 500)
    }

    const { username, password } = await c.req.json()
    
    if (!username || !password) {
      return c.json({ error: 'ユーザー名とパスワードを入力してください' }, 400)
    }
    
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
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ 
      error: 'ログインエラー',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
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

// プロジェクト一覧取得（全アカウント共有）
app.get('/api/projects', async (c) => {
  const projects = await c.env.DB.prepare(`
    SELECT p.*, u.username as created_by_name
    FROM projects p
    JOIN users u ON p.created_by = u.id
    ORDER BY p.name ASC
  `).all()
  
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
  const { userId } = await c.req.json()
  
  // adminチェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()
  
  if (!user || user.username !== 'admin') {
    return c.json({ error: '削除権限がありません' }, 403)
  }
  
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
  const { userId } = await c.req.json()
  
  // adminチェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()
  
  if (!user || user.username !== 'admin') {
    return c.json({ error: '削除権限がありません' }, 403)
  }
  
  await c.env.DB.prepare(
    'DELETE FROM subprojects WHERE id = ?'
  ).bind(subprojectId).run()
  
  return c.json({ success: true })
})

// ==================== ファイル API ====================

// ファイル一覧取得（階層構造対応）
app.get('/api/subprojects/:id/files', async (c) => {
  const subprojectId = c.req.param('id')
  const path = c.req.query('path') || '/'
  
  const files = await c.env.DB.prepare(`
    SELECT f.*, u.username as updated_by_name
    FROM files f
    JOIN users u ON f.updated_by = u.id
    WHERE f.subproject_id = ? AND f.path = ?
    ORDER BY f.file_type DESC, f.name ASC
  `).bind(subprojectId, path).all()
  
  return c.json(files.results)
})

// ファイル検索・フィルタリング（子プロジェクト内全体）
app.get('/api/subprojects/:id/files/search', async (c) => {
  const subprojectId = c.req.param('id')
  const q = c.req.query('q') || ''
  const type = c.req.query('type') // 'image', '3d', 'text', 'video', 'folder'
  const updatedBy = c.req.query('updatedBy')
  const minSize = c.req.query('minSize') ? parseInt(c.req.query('minSize')!) : null
  const maxSize = c.req.query('maxSize') ? parseInt(c.req.query('maxSize')!) : null
  const dateFrom = c.req.query('dateFrom')
  const dateTo = c.req.query('dateTo')
  
  let query = `
    SELECT f.*, u.username as updated_by_name
    FROM files f
    JOIN users u ON f.updated_by = u.id
    WHERE f.subproject_id = ?
  `
  const params: any[] = [subprojectId]
  
  // 検索文字列
  if (q) {
    query += ` AND (f.name LIKE ? OR f.path LIKE ?)`
    params.push(`%${q}%`, `%${q}%`)
  }
  
  // ファイルタイプフィルタ
  if (type === 'folder') {
    query += ` AND f.file_type = 'folder'`
  } else if (type) {
    query += ` AND f.file_type = 'file'`
    // MIMEタイプでフィルタリング
    if (type === 'image') {
      query += ` AND f.mime_type LIKE 'image/%'`
    } else if (type === '3d') {
      query += ` AND (f.mime_type LIKE 'model/%' OR f.name LIKE '%.stl' OR f.name LIKE '%.blend' OR f.name LIKE '%.glb' OR f.name LIKE '%.gltf' OR f.name LIKE '%.obj' OR f.name LIKE '%.fbx')`
    } else if (type === 'text') {
      query += ` AND (f.mime_type LIKE 'text/%' OR f.mime_type LIKE 'application/javascript%' OR f.mime_type LIKE 'application/json%' OR f.mime_type LIKE 'application/xml%' OR f.name LIKE '%.md' OR f.name LIKE '%.html' OR f.name LIKE '%.css' OR f.name LIKE '%.js' OR f.name LIKE '%.json' OR f.name LIKE '%.xml' OR f.name LIKE '%.yaml' OR f.name LIKE '%.yml')`
    } else if (type === 'video') {
      query += ` AND f.mime_type LIKE 'video/%'`
    }
  }
  
  // 更新者フィルタ
  if (updatedBy) {
    query += ` AND u.username = ?`
    params.push(updatedBy)
  }
  
  // ファイルサイズフィルタ
  if (minSize !== null) {
    query += ` AND f.file_size >= ?`
    params.push(minSize)
  }
  if (maxSize !== null) {
    query += ` AND f.file_size <= ?`
    params.push(maxSize)
  }
  
  // 更新日フィルタ
  if (dateFrom) {
    query += ` AND f.updated_at >= ?`
    params.push(dateFrom)
  }
  if (dateTo) {
    query += ` AND f.updated_at <= ?`
    params.push(dateTo)
  }
  
  query += ` ORDER BY f.file_type DESC, f.name ASC`
  
  const files = await c.env.DB.prepare(query).bind(...params).all()
  
  return c.json(files.results)
})

// 子プロジェクトの全ファイル取得（ZIPダウンロード用）
app.get('/api/subprojects/:id/files/all', async (c) => {
  const subprojectId = c.req.param('id')
  
  const files = await c.env.DB.prepare(`
    SELECT f.*, u.username as updated_by_name
    FROM files f
    JOIN users u ON f.updated_by = u.id
    WHERE f.subproject_id = ? AND f.file_type = 'file'
    ORDER BY f.path ASC, f.name ASC
  `).bind(subprojectId).all()
  
  return c.json(files.results)
})

// ファイル重複チェック
app.get('/api/subprojects/:id/files/check-duplicate', async (c) => {
  const subprojectId = c.req.param('id')
  const name = c.req.query('name')
  const path = c.req.query('path') || '/'
  
  if (!name) {
    return c.json({ error: 'ファイル名が必要です' }, 400)
  }
  
  const existingFile = await c.env.DB.prepare(
    'SELECT f.*, u.username as updated_by_name FROM files f LEFT JOIN users u ON f.updated_by = u.id WHERE f.subproject_id = ? AND f.name = ? AND f.path = ? AND f.file_type = ?'
  ).bind(subprojectId, name, path, 'file').first()
  
  if (existingFile) {
    return c.json({ 
      duplicate: true, 
      file: existingFile 
    })
  }
  
  return c.json({ duplicate: false })
})

// フォルダ作成
app.post('/api/subprojects/:id/folders', async (c) => {
  const subprojectId = c.req.param('id')
  const { name, path, userId, projectId } = await c.req.json()
  
  // 既に存在するフォルダかチェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM files WHERE subproject_id = ? AND name = ? AND path = ? AND file_type = ?'
  ).bind(subprojectId, name, path, 'folder').first()
  
  if (existing) {
    return c.json({ success: true, folderId: existing.id, alreadyExists: true })
  }
  
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, path, file_type, updated_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(subprojectId, name, path, 'folder', userId).run()
  
  const folderId = result.meta.last_row_id
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, folderId, 'created', `フォルダ ${name} を作成しました`).run()
  
  return c.json({ success: true, folderId })
})

// ファイル作成（単一ファイル）
app.post('/api/subprojects/:id/files', async (c) => {
  const subprojectId = c.req.param('id')
  const { name, content, path, userId, projectId, mimeType, fileSize } = await c.req.json()
  
  // まずD1にメタデータを保存（fileIdを取得するため）
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(subprojectId, name, path || '/', 'file', mimeType, fileSize || 0, userId).run()
  
  const fileId = result.meta.last_row_id
  
  // R2のオブジェクトキーを生成
  const r2Key = `files/${subprojectId}/${fileId}/${name}`
  
  // ファイル内容をR2にアップロード
  // contentがバイナリ文字列の場合、ArrayBufferに変換
  let uploadContent: string | ArrayBuffer | ArrayBufferView
  if (typeof content === 'string') {
    // バイナリ文字列かテキスト文字列かを判定
    // バイナリファイルの場合は、文字列をArrayBufferに変換
    const isBinary = mimeType && !mimeType.startsWith('text/') && mimeType !== 'application/json'
    if (isBinary) {
      // バイナリ文字列をArrayBufferに変換
      const binaryString = content
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      uploadContent = bytes.buffer
    } else {
      // テキストファイルの場合はそのまま
      uploadContent = content
    }
  } else {
    uploadContent = content
  }
  
  await c.env.R2.put(r2Key, uploadContent, {
    httpMetadata: {
      contentType: mimeType || 'text/plain',
    },
  })
  
  // D1のr2_keyを更新
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(r2Key, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${name}を作成しました`).run()
  
  return c.json({ success: true, fileId })
})

// Presigned URL生成（S3直接アップロード用）
app.post('/api/subprojects/:id/files/presigned-url', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileName, fileSize, mimeType, path, userId, projectId } = await c.req.json()
  
  // AWS認証情報の確認
  if (!c.env.AWS_ACCESS_KEY_ID || !c.env.AWS_SECRET_ACCESS_KEY || !c.env.S3_BUCKET) {
    return c.json({ error: 'AWS設定が完了していません' }, 500)
  }
  
  // D1にメタデータを保存
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(subprojectId, fileName, path || '/', 'file', mimeType, fileSize || 0, userId).run()
  
  const fileId = result.meta.last_row_id
  const s3Key = `files/${subprojectId}/${fileId}/${fileName}`
  
  // S3クライアントの作成
  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
    },
  })
  
  // Presigned URLを生成（15分間有効）
  const command = new PutObjectCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    ContentType: mimeType || 'application/octet-stream',
  })
  
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }) // 15分
  
  return c.json({ 
    success: true, 
    fileId, 
    presignedUrl, 
    s3Key,
    callbackUrl: `/api/subprojects/${subprojectId}/files/${fileId}/upload-complete`
  })
})

// アップロード完了通知
app.post('/api/subprojects/:id/files/:fileId/upload-complete', async (c) => {
  const subprojectId = c.req.param('id')
  const fileId = c.req.param('fileId')
  const { s3Key, userId, projectId } = await c.req.json()
  
  // D1のr2_key（実際はs3_key）を更新
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(s3Key, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${s3Key.split('/').pop()}を作成しました`).run()
  
  return c.json({ success: true })
})

// チャンクアップロード開始（メタデータ作成）- 後方互換性のため残す
app.post('/api/subprojects/:id/files/chunk-start', async (c) => {
  const subprojectId = c.req.param('id')
  const { name, path, userId, projectId, mimeType, fileSize, totalChunks } = await c.req.json()
  
  // D1にメタデータを保存（チャンクアップロード中フラグ付き）
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(subprojectId, name, path || '/', 'file', mimeType, fileSize || 0, userId).run()
  
  const fileId = result.meta.last_row_id
  const r2Key = `files/${subprojectId}/${fileId}/${name}`
  
  return c.json({ success: true, fileId, r2Key, totalChunks })
})

// チャンクアップロード（各チャンクをアップロード）
app.post('/api/subprojects/:id/files/chunk-upload', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileId, chunkIndex, chunkData, r2Key, mimeType } = await c.req.json()
  
  // チャンクを一時的にR2に保存（チャンク番号付き）
  const chunkKey = `${r2Key}.chunk.${chunkIndex}`
  
  // バイナリデータをArrayBufferに変換
  let uploadContent: string | ArrayBuffer | ArrayBufferView
  if (typeof chunkData === 'string') {
    const bytes = new Uint8Array(chunkData.length)
    for (let i = 0; i < chunkData.length; i++) {
      bytes[i] = chunkData.charCodeAt(i)
    }
    uploadContent = bytes.buffer
  } else {
    uploadContent = chunkData
  }
  
  await c.env.R2.put(chunkKey, uploadContent, {
    httpMetadata: {
      contentType: mimeType || 'application/octet-stream',
    },
  })
  
  return c.json({ success: true, chunkIndex })
})

// チャンクアップロード完了（チャンクを結合）
app.post('/api/subprojects/:id/files/chunk-complete', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileId, r2Key, totalChunks, mimeType, userId, projectId } = await c.req.json()
  
  // すべてのチャンクを読み込んで結合
  const chunks: ArrayBuffer[] = []
  
  for (let i = 0; i < totalChunks; i++) {
    const chunkKey = `${r2Key}.chunk.${i}`
    const chunkObject = await c.env.R2.get(chunkKey)
    
    if (!chunkObject) {
      // チャンクが見つからない場合は、既存のチャンクをクリーンアップ
      for (let j = 0; j < i; j++) {
        await c.env.R2.delete(`${r2Key}.chunk.${j}`)
      }
      return c.json({ error: `チャンク ${i} が見つかりません` }, 400)
    }
    
    const chunkData = await chunkObject.arrayBuffer()
    chunks.push(chunkData)
    
    // チャンクを削除（メモリ節約）
    await c.env.R2.delete(chunkKey)
  }
  
  // チャンクを結合
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const combined = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset)
    offset += chunk.byteLength
  }
  
  // 結合したファイルをR2にアップロード
  await c.env.R2.put(r2Key, combined.buffer, {
    httpMetadata: {
      contentType: mimeType || 'application/octet-stream',
    },
  })
  
  // D1のr2_keyを更新
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(r2Key, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${r2Key.split('/').pop()}を作成しました`).run()
  
  return c.json({ success: true, fileId })
})

// 複数ファイル一括アップロード
app.post('/api/subprojects/:id/files/batch', async (c) => {
  const subprojectId = c.req.param('id')
  const { files, userId, projectId } = await c.req.json()
  
  const fileIds = []
  
  for (const file of files) {
    // まずD1にメタデータを保存（fileIdを取得するため）
    const result = await c.env.DB.prepare(
      'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(subprojectId, file.name, file.path || '/', 'file', file.mimeType, file.fileSize || 0, userId).run()
    
    const fileId = result.meta.last_row_id
    fileIds.push(fileId)
    
    // R2のオブジェクトキーを生成
    const r2Key = `files/${subprojectId}/${fileId}/${file.name}`
    
    // ファイル内容をR2にアップロード
    await c.env.R2.put(r2Key, file.content, {
      httpMetadata: {
        contentType: file.mimeType || 'text/plain',
      },
    })
    
    // D1のr2_keyを更新
    await c.env.DB.prepare(
      'UPDATE files SET r2_key = ? WHERE id = ?'
    ).bind(r2Key, fileId).run()
  }
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, null, 'created', `${files.length}個のファイルをアップロードしました`).run()
  
  return c.json({ success: true, fileIds })
})

// ファイル更新
app.put('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { name, content, userId, projectId } = await c.req.json()
  
  // 既存のファイル情報を取得
  const existingFile = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!existingFile) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  // 現在のバージョンを履歴に保存（S3キーがある場合のみ）
  const currentS3Key = existingFile.r2_key as string | null
  if (currentS3Key && c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      // 現在の最大バージョン番号を取得
      const maxVersionResult = await c.env.DB.prepare(
        'SELECT MAX(version) as max_version FROM file_versions WHERE file_id = ?'
      ).bind(fileId).first()
      
      const nextVersion = ((maxVersionResult?.max_version as number) || 0) + 1
      
      // バージョン用のS3キーを生成
      const fileExt = name.split('.').pop() || ''
      const versionS3Key = `files/${existingFile.subproject_id}/${fileId}/versions/${nextVersion}.${fileExt}`
      
      // S3クライアントの作成
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      // 現在のファイルをバージョンとしてコピー
      const copyCommand = new CopyObjectCommand({
        Bucket: c.env.S3_BUCKET,
        CopySource: `${c.env.S3_BUCKET}/${currentS3Key}`,
        Key: versionS3Key,
      })
      
      await s3Client.send(copyCommand)
      
      // バージョン情報をデータベースに保存
      await c.env.DB.prepare(
        'INSERT INTO file_versions (file_id, version, s3_key, file_size, mime_type, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        fileId,
        nextVersion,
        versionS3Key,
        existingFile.file_size || 0,
        existingFile.mime_type || 'application/octet-stream',
        userId
      ).run()
    } catch (error) {
      console.error('バージョン保存エラー:', error)
      // エラーが発生しても更新処理は続行
    }
  }
  
  // R2キーを決定（既存のキーがある場合はそれを使用、ない場合は新規生成）
  let r2Key = existingFile.r2_key as string | null
  if (!r2Key) {
    // 後方互換性のため、既存ファイルでr2_keyがない場合は生成
    r2Key = `files/${existingFile.subproject_id}/${fileId}/${name}`
  } else if (existingFile.name !== name) {
    // ファイル名が変更された場合は、新しいキーを生成して古いキーを削除
    const oldR2Key = r2Key
    r2Key = `files/${existingFile.subproject_id}/${fileId}/${name}`
    
    // S3の場合は古いキーを削除
    if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
      try {
        const s3Client = new S3Client({
          region: c.env.AWS_REGION || 'ap-northeast-1',
          credentials: {
            accessKeyId: c.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
          },
        })
        await s3Client.send(new DeleteObjectCommand({
          Bucket: c.env.S3_BUCKET,
          Key: oldR2Key,
        }))
      } catch (error) {
        console.error('S3削除エラー:', error)
      }
    } else {
      // R2の場合は古いオブジェクトを削除
      await c.env.R2.delete(oldR2Key)
    }
  }
  
  // ファイル内容をR2またはS3にアップロード/更新
  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    // S3にアップロード
    const s3Client = new S3Client({
      region: c.env.AWS_REGION || 'ap-northeast-1',
      credentials: {
        accessKeyId: c.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
      },
    })
    
    // contentをArrayBufferに変換
    let uploadContent: ArrayBuffer
    if (typeof content === 'string') {
      const bytes = new Uint8Array(content.length)
      for (let i = 0; i < content.length; i++) {
        bytes[i] = content.charCodeAt(i)
      }
      uploadContent = bytes.buffer
    } else {
      uploadContent = content
    }
    
    await s3Client.send(new PutObjectCommand({
      Bucket: c.env.S3_BUCKET,
      Key: r2Key,
      Body: uploadContent,
      ContentType: existingFile.mime_type as string || 'text/plain',
    }))
  } else {
    // R2にアップロード
    await c.env.R2.put(r2Key, content, {
      httpMetadata: {
        contentType: existingFile.mime_type as string || 'text/plain',
      },
    })
  }
  
  // D1のメタデータを更新
  await c.env.DB.prepare(
    'UPDATE files SET name = ?, r2_key = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, r2Key, userId, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'updated', `${name}を更新しました`).run()
  
  return c.json({ success: true })
})

// ファイル削除（S3対応、フォルダ配下のファイルも削除）
app.delete('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { userId, projectId, fileName } = await c.req.json()
  
  // 既存のファイル情報を取得
  const existingFile = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!existingFile) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  const isFolder = existingFile.file_type === 'folder'
  const folderPath = isFolder ? `${existingFile.path === '/' ? '' : existingFile.path}/${existingFile.name}` : null
  
  // フォルダの場合は、配下のすべてのファイルとフォルダを削除
  if (isFolder && folderPath) {
    // フォルダ配下のすべてのファイルを取得（再帰的に）
    const allFiles = await c.env.DB.prepare(`
      SELECT * FROM files 
      WHERE subproject_id = ? 
      AND (path = ? OR path LIKE ?)
      ORDER BY path DESC
    `).bind(
      existingFile.subproject_id,
      folderPath,
      `${folderPath}/%`
    ).all()
    
    // 各ファイルを削除
    for (const file of allFiles.results) {
      await deleteFileFromStorage(file, c.env)
      await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run()
    }
  }
  
  // ファイル/フォルダ自体を削除
  const s3Key = existingFile.r2_key as string | null
  
  // ファイルの場合はS3からも削除
  if (!isFolder && s3Key) {
    await deleteFileFromStorage(existingFile, c.env)
  }
  
  // D1からレコードを削除
  await c.env.DB.prepare(
    'DELETE FROM files WHERE id = ?'
  ).bind(fileId).run()
  
  // タイムラインに記録
  const itemType = isFolder ? 'フォルダ' : 'ファイル'
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, null, 'deleted', `${itemType} ${fileName}を削除しました`).run()
  
  return c.json({ success: true })
})

// ストレージからファイルを削除するヘルパー関数
async function deleteFileFromStorage(file: any, env: Bindings) {
  const s3Key = file.r2_key as string | null
  
  if (!s3Key) return
  
  // S3から削除（AWS設定がある場合）
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      const command = new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
      })
      
      await s3Client.send(command)
    } catch (error) {
      console.error('S3削除エラー:', error)
      // エラー時はR2にフォールバック
      if (s3Key) {
        await env.R2.delete(s3Key)
      }
    }
  } else if (s3Key) {
    // R2からオブジェクトを削除（後方互換性）
    await env.R2.delete(s3Key)
  }
}

// ファイルダウンロード（S3対応）
app.get('/api/files/:id/download', async (c) => {
  const fileId = c.req.param('id')
  
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  // フォルダの場合はエラー
  if (file.file_type === 'folder') {
    return c.json({ error: 'フォルダはダウンロードできません' }, 400)
  }
  
  const s3Key = file.r2_key as string | null
  
  // S3から取得（AWS設定がある場合）
  if (s3Key && c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      const command = new GetObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: s3Key,
      })
      
      const response = await s3Client.send(command)
      
      if (response.Body) {
        // ReadableStreamを取得
        const stream = response.Body as ReadableStream
        return new Response(stream, {
          headers: {
            'Content-Type': file.mime_type as string || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${file.name}"`
          }
        })
      }
    } catch (error) {
      console.error('S3ダウンロードエラー:', error)
      // エラー時はR2にフォールバック
    }
  }
  
  // R2からファイル内容を取得（後方互換性）
  if (s3Key) {
    const r2Object = await c.env.R2.get(s3Key)
    if (r2Object) {
      return new Response(r2Object.body, {
        headers: {
          'Content-Type': file.mime_type as string || 'text/plain',
          'Content-Disposition': `attachment; filename="${file.name}"`
        }
      })
    }
  }
  
  // 後方互換性: r2_keyがない場合はcontentカラムから取得（既存データ用）
  if (file.content) {
    return new Response(file.content as string, {
      headers: {
        'Content-Type': file.mime_type as string || 'text/plain',
        'Content-Disposition': `attachment; filename="${file.name}"`
      }
    })
  }
  
  return c.json({ error: 'ファイルの内容が見つかりません' }, 404)
})

// ファイル変更ログ取得
app.get('/api/files/:id/history', async (c) => {
  const fileId = c.req.param('id')
  
  const history = await c.env.DB.prepare(`
    SELECT t.*, u.username, f.name as file_name
    FROM timeline t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN files f ON t.file_id = f.id
    WHERE t.file_id = ?
    ORDER BY t.created_at DESC
  `).bind(fileId).all()
  
  return c.json(history.results)
})

// ファイルバージョン履歴取得
app.get('/api/files/:id/versions', async (c) => {
  const fileId = c.req.param('id')
  
  const versions = await c.env.DB.prepare(`
    SELECT fv.*, u.username as created_by_name
    FROM file_versions fv
    JOIN users u ON fv.created_by = u.id
    WHERE fv.file_id = ?
    ORDER BY fv.version DESC
  `).bind(fileId).all()
  
  return c.json(versions.results)
})

// ファイルバージョン復元
app.post('/api/files/:id/restore', async (c) => {
  const fileId = c.req.param('id')
  const { versionId, userId, projectId } = await c.req.json()
  
  if (!versionId || !userId || !projectId) {
    return c.json({ error: 'versionId, userId, projectIdが必要です' }, 400)
  }
  
  // ファイル情報を取得
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  // バージョン情報を取得
  const version = await c.env.DB.prepare(
    'SELECT * FROM file_versions WHERE id = ? AND file_id = ?'
  ).bind(versionId, fileId).first()
  
  if (!version) {
    return c.json({ error: 'バージョンが見つかりません' }, 404)
  }
  
  // 現在のバージョンを履歴に保存（復元前に現在の状態を保存）
  const currentS3Key = file.r2_key as string | null
  if (currentS3Key && c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      // 現在の最大バージョン番号を取得
      const maxVersionResult = await c.env.DB.prepare(
        'SELECT MAX(version) as max_version FROM file_versions WHERE file_id = ?'
      ).bind(fileId).first()
      
      const nextVersion = ((maxVersionResult?.max_version as number) || 0) + 1
      
      // バージョン用のS3キーを生成
      const fileExt = (file.name as string).split('.').pop() || ''
      const versionS3Key = `files/${file.subproject_id}/${fileId}/versions/${nextVersion}.${fileExt}`
      
      // S3クライアントの作成
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      // 現在のファイルをバージョンとしてコピー
      const copyCommand = new CopyObjectCommand({
        Bucket: c.env.S3_BUCKET,
        CopySource: `${c.env.S3_BUCKET}/${currentS3Key}`,
        Key: versionS3Key,
      })
      
      await s3Client.send(copyCommand)
      
      // バージョン情報をデータベースに保存
      await c.env.DB.prepare(
        'INSERT INTO file_versions (file_id, version, s3_key, file_size, mime_type, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        fileId,
        nextVersion,
        versionS3Key,
        file.file_size || 0,
        file.mime_type || 'application/octet-stream',
        userId
      ).run()
    } catch (error) {
      console.error('バージョン保存エラー:', error)
    }
  }
  
  // 復元するバージョンのファイルを現在のファイルにコピー
  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      const versionS3Key = version.s3_key as string
      const currentS3Key = file.r2_key as string
      
      // バージョンファイルを現在のファイルにコピー
      const copyCommand = new CopyObjectCommand({
        Bucket: c.env.S3_BUCKET,
        CopySource: `${c.env.S3_BUCKET}/${versionS3Key}`,
        Key: currentS3Key,
      })
      
      await s3Client.send(copyCommand)
      
      // ファイル情報を更新
      await c.env.DB.prepare(
        'UPDATE files SET file_size = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(version.file_size, userId, fileId).run()
      
      // タイムラインに記録
      await c.env.DB.prepare(
        'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
      ).bind(projectId, userId, fileId, 'updated', `${file.name}をバージョン${version.version}から復元しました`).run()
      
      return c.json({ success: true })
    } catch (error) {
      console.error('復元エラー:', error)
      return c.json({ error: 'ファイルの復元に失敗しました' }, 500)
    }
  } else {
    return c.json({ error: 'S3設定が完了していません' }, 500)
  }
})

// プレビュー用Presigned URL生成
app.get('/api/files/:id/preview-url', async (c) => {
  const fileId = c.req.param('id')
  
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  // フォルダの場合はエラー
  if (file.file_type === 'folder') {
    return c.json({ error: 'フォルダはプレビューできません' }, 400)
  }
  
  const s3Key = file.r2_key as string | null
  
  if (!s3Key) {
    return c.json({ error: 'ファイルのストレージキーが見つかりません' }, 404)
  }
  
  // S3からPresigned URLを生成（1時間有効）
  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY,
        },
      })
      
      const command = new GetObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: s3Key,
      })
      
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1時間
      
      return c.json({ 
        success: true, 
        previewUrl: presignedUrl,
        mimeType: file.mime_type as string || 'application/octet-stream',
        fileName: file.name as string
      })
    } catch (error) {
      console.error('S3 Presigned URL生成エラー:', error)
      return c.json({ error: 'プレビューURLの生成に失敗しました' }, 500)
    }
  }
  
  // R2の場合は直接URLを返す（Cloudflare R2のPublic URLを使用する場合）
  return c.json({ error: 'S3設定が見つかりません' }, 500)
})

// ファイル移動
app.post('/api/files/:id/move', async (c) => {
  const fileId = c.req.param('id')
  const { targetPath, targetSubprojectId, userId, projectId } = await c.req.json()
  
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  const newSubprojectId = targetSubprojectId || file.subproject_id
  const newPath = targetPath || file.path
  
  // 同じ場所への移動は無視
  if (newSubprojectId === file.subproject_id && newPath === file.path) {
    return c.json({ success: true, message: '移動先が同じです' })
  }
  
  // フォルダの場合は、配下のファイルも移動
  if (file.file_type === 'folder') {
    const oldFolderPath = `${file.path === '/' ? '' : file.path}/${file.name}`
    const newFolderPath = `${newPath === '/' ? '' : newPath}/${file.name}`
    
    // 配下のファイルを取得
    const childFiles = await c.env.DB.prepare(`
      SELECT * FROM files 
      WHERE subproject_id = ? 
      AND (path = ? OR path LIKE ?)
    `).bind(
      file.subproject_id,
      oldFolderPath,
      `${oldFolderPath}/%`
    ).all()
    
    // 各ファイルのパスを更新
    for (const childFile of childFiles.results) {
      const newChildPath = childFile.path.replace(oldFolderPath, newFolderPath)
      await c.env.DB.prepare(
        'UPDATE files SET path = ?, subproject_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(newChildPath, newSubprojectId, userId, childFile.id).run()
    }
  }
  
  // ファイル/フォルダ自体を移動
  await c.env.DB.prepare(
    'UPDATE files SET path = ?, subproject_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPath, newSubprojectId, userId, fileId).run()
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'updated', `${file.name}を移動しました`).run()
  
  return c.json({ success: true })
})

// ファイルコピー
app.post('/api/files/:id/copy', async (c) => {
  const fileId = c.req.param('id')
  const { targetPath, targetSubprojectId, newName, userId, projectId } = await c.req.json()
  
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ?'
  ).bind(fileId).first()
  
  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }
  
  const newSubprojectId = targetSubprojectId || file.subproject_id
  const newPath = targetPath || file.path
  const copiedName = newName || file.name
  
  // 新しいファイルレコードを作成
  const result = await c.env.DB.prepare(
    'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    newSubprojectId,
    copiedName,
    newPath,
    file.file_type,
    file.mime_type,
    file.file_size,
    userId,
    file.r2_key // 同じS3キーを参照（またはコピーが必要な場合は後で処理）
  ).run()
  
  const newFileId = result.meta.last_row_id
  
  // フォルダの場合は、配下のファイルも再帰的にコピー
  if (file.file_type === 'folder') {
    const oldFolderPath = `${file.path === '/' ? '' : file.path}/${file.name}`
    const newFolderPath = `${newPath === '/' ? '' : newPath}/${copiedName}`
    
    // 配下のファイルを取得
    const childFiles = await c.env.DB.prepare(`
      SELECT * FROM files 
      WHERE subproject_id = ? 
      AND (path = ? OR path LIKE ?)
      ORDER BY path ASC
    `).bind(
      file.subproject_id,
      oldFolderPath,
      `${oldFolderPath}/%`
    ).all()
    
    // 各ファイルをコピー
    for (const childFile of childFiles.results) {
      const newChildPath = childFile.path.replace(oldFolderPath, newFolderPath)
      await c.env.DB.prepare(
        'INSERT INTO files (subproject_id, name, path, file_type, mime_type, file_size, updated_by, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        newSubprojectId,
        childFile.name,
        newChildPath,
        childFile.file_type,
        childFile.mime_type,
        childFile.file_size,
        userId,
        childFile.r2_key
      ).run()
    }
  }
  
  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, newFileId, 'created', `${copiedName}をコピーしました`).run()
  
  return c.json({ success: true, fileId: newFileId })
})

// ==================== タイムライン API ====================

// 全プロジェクトの直近のタイムライン取得
app.get('/api/timeline/recent', async (c) => {
  const limit = parseInt(c.req.query('limit') || '5')
  
  // 全プロジェクトのタイムラインを取得
  const timeline = await c.env.DB.prepare(`
    SELECT t.*, u.username, f.name as file_name, p.name as project_name, p.id as project_id
    FROM timeline t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN files f ON t.file_id = f.id
    JOIN projects p ON t.project_id = p.id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).bind(limit).all()
  
  return c.json(timeline.results)
})

// タイムライン取得（ページネーション対応）
app.get('/api/projects/:id/timeline', async (c) => {
  const projectId = c.req.param('id')
  const page = parseInt(c.req.query('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  
  // 総件数を取得
  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as total
    FROM timeline
    WHERE project_id = ?
  `).bind(projectId).first()
  
  const total = (countResult?.total as number) || 0
  const totalPages = Math.ceil(total / limit)
  
  // タイムラインを取得
  const timeline = await c.env.DB.prepare(`
    SELECT t.*, u.username, f.name as file_name
    FROM timeline t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN files f ON t.file_id = f.id
    WHERE t.project_id = ?
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(projectId, limit, offset).all()
  
  return c.json({
    items: timeline.results,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  })
})

// ==================== ユーザー API ====================

// ユーザー一覧取得
app.get('/api/users', async (c) => {
  const users = await c.env.DB.prepare(
    'SELECT id, username, email FROM users ORDER BY username ASC'
  ).all()
  
  return c.json(users.results)
})

// ユーザー検索
app.get('/api/users/search', async (c) => {
  const query = c.req.query('q')
  
  const users = await c.env.DB.prepare(
    'SELECT id, username, email FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 10'
  ).bind(`%${query}%`, `%${query}%`).all()
  
  return c.json(users.results)
})

// ユーザー削除
app.delete('/api/users/:id', async (c) => {
  const userId = c.req.param('id')
  const { adminUserId } = await c.req.json()
  
  // adminチェック
  const admin = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(adminUserId).first()
  
  if (!admin || admin.username !== 'admin') {
    return c.json({ error: '削除権限がありません' }, 403)
  }
  
  // 自分自身は削除できない
  if (parseInt(userId) === adminUserId) {
    return c.json({ error: '自分自身を削除することはできません' }, 400)
  }
  
  // トランザクションで関連データを処理
  // 1. そのユーザーが作成したプロジェクトを削除（プロジェクトメンバー、子プロジェクト、ファイルもCASCADEで削除される）
  await c.env.DB.prepare(
    'DELETE FROM projects WHERE created_by = ?'
  ).bind(userId).run()
  
  // 2. そのユーザーが更新したファイルのupdated_byをadminに変更（またはNULLに設定）
  // adminユーザーIDを取得
  const adminUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).bind('admin').first()
  
  if (adminUser) {
    // adminが存在する場合は、adminに変更
    await c.env.DB.prepare(
      'UPDATE files SET updated_by = ? WHERE updated_by = ?'
    ).bind(adminUser.id, userId).run()
  } else {
    // adminが存在しない場合は、最初のユーザーに変更
    const firstUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id != ? ORDER BY id ASC LIMIT 1'
    ).bind(userId).first()
    
    if (firstUser) {
      await c.env.DB.prepare(
        'UPDATE files SET updated_by = ? WHERE updated_by = ?'
      ).bind(firstUser.id, userId).run()
    }
  }
  
  // 3. タイムラインのuser_idをadminに変更（またはNULLに設定）
  if (adminUser) {
    await c.env.DB.prepare(
      'UPDATE timeline SET user_id = ? WHERE user_id = ?'
    ).bind(adminUser.id, userId).run()
  } else {
    const firstUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id != ? ORDER BY id ASC LIMIT 1'
    ).bind(userId).first()
    
    if (firstUser) {
      await c.env.DB.prepare(
        'UPDATE timeline SET user_id = ? WHERE user_id = ?'
      ).bind(firstUser.id, userId).run()
    }
  }
  
  // 4. ユーザーを削除（project_membersはON DELETE CASCADEで自動削除される）
  await c.env.DB.prepare(
    'DELETE FROM users WHERE id = ?'
  ).bind(userId).run()
  
  return c.json({ success: true })
})

// パスワード更新
app.put('/api/users/:id/password', async (c) => {
  const userId = c.req.param('id')
  const { currentPassword, newPassword, userId: requestUserId } = await c.req.json()
  
  // 自分自身のパスワードのみ変更可能
  if (parseInt(userId) !== requestUserId) {
    return c.json({ error: '自分のパスワードのみ変更できます' }, 403)
  }
  
  // 現在のパスワードを確認
  const user = await c.env.DB.prepare(
    'SELECT password FROM users WHERE id = ?'
  ).bind(userId).first()
  
  if (!user) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }
  
  // 簡易認証（開発用）
  if (user.password !== currentPassword) {
    return c.json({ error: '現在のパスワードが正しくありません' }, 401)
  }
  
  // パスワードを更新
  await c.env.DB.prepare(
    'UPDATE users SET password = ? WHERE id = ?'
  ).bind(newPassword, userId).run()
  
  return c.json({ success: true })
})

// ==================== ルートページ ====================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CoNAGIT</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
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
        
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
