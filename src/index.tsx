import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SignJWT, jwtVerify } from 'jose'
import { DOMParser as XmldomDOMParser } from '@xmldom/xmldom'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_REGION?: string
  S3_BUCKET?: string
  JWT_SECRET?: string
  DISCORD_WEBHOOK_URL?: string
  DISCORD_BOT_TOKEN?: string
  DISCORD_APPLICATION_ID?: string
  DISCORD_CHANNEL_ID?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Cloudflare Workers 環境では DOMParser/Node が無いため、S3 SDK が XML を扱う際に必要なポリフィルを設定
if (!(globalThis as any).DOMParser) {
  ; (globalThis as any).DOMParser = XmldomDOMParser as any
}
if (!(globalThis as any).Node) {
  ; (globalThis as any).Node = {
    ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12
  }
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const cryptoImpl: any = (globalThis as any).crypto || (globalThis as any).webkitCrypto
const generateUuid = () => cryptoImpl.randomUUID()
const isValidUuid = (value: string | undefined | null): value is string => {
  return typeof value === 'string' && uuidRegex.test(value)
}
const isGuestUser = (value: string | undefined | null) => value === 'guest'
const denyGuest = (c: any, userId: string | undefined | null) => {
  if (isGuestUser(userId)) {
    return c.json({ error: 'ゲストユーザーはこの操作を実行できません' }, 403)
  }
  return null
}

/** ファイル操作通知を Discord（Webhook または Bot）に送る。fire-and-forget、失敗時はログのみ。 */
function notifyDiscord(env: Bindings, message: string): void {
  const content = `[CoNAGIT] ${new Date().toISOString()} - ${message}`
  if (env.DISCORD_WEBHOOK_URL) {
    fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error('[notifyDiscord] Webhook HTTP error:', res.status, res.statusText, await res.text())
        }
      })
      .catch((err) => console.error('[notifyDiscord] Webhook failed:', err))
    return
  }
  if (env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID) {
    fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    }).catch((err) => console.error('[notifyDiscord] Bot API failed:', err))
  }
}

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
app.use('/static/*', serveStatic({ root: './public' } as any))

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
  const userId = generateUuid()

  try {
    await c.env.DB.prepare(
      'INSERT INTO users (id, username, password, email) VALUES (?, ?, ?, ?)'
    ).bind(userId, username, hashedPassword, email).run()

    return c.json({
      success: true,
      userId
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
    ORDER BY p.display_order ASC, p.name ASC
  `).all()

  return c.json(projects.results)
})

// プロジェクト作成
app.post('/api/projects', async (c) => {
  const { name, description, userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  const projectId = generateUuid()

  await c.env.DB.prepare(
    'INSERT INTO projects (id, name, description, created_by, guest_visible) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, name, description, userId, 0).run()

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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


// プロジェクト並び順移動（admin専用）
app.put('/api/projects/:id/move', async (c) => {
  const projectId = c.req.param('id')
  const { direction, userId } = await c.req.json()

  if (!direction || !['left', 'right'].includes(direction)) {
    return c.json({ error: 'directionはleftまたはrightが必要です' }, 400)
  }
  if (!userId) {
    return c.json({ error: 'userIdが必要です' }, 400)
  }

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // adminチェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user || user.username !== 'admin') {
    return c.json({ error: '並び替え権限がありません' }, 403)
  }

  // 現在のプロジェクト情報取得
  const project = await c.env.DB.prepare(
    'SELECT id, display_order FROM projects WHERE id = ?'
  ).bind(projectId).first()

  if (!project) {
    return c.json({ error: 'プロジェクトが見つかりません' }, 404)
  }

  const currentOrder = Number(project.display_order)

  const neighbor = direction === 'left'
    ? await c.env.DB.prepare(
      'SELECT id, display_order FROM projects WHERE display_order < ? ORDER BY display_order DESC LIMIT 1'
    ).bind(currentOrder).first()
    : await c.env.DB.prepare(
      'SELECT id, display_order FROM projects WHERE display_order > ? ORDER BY display_order ASC LIMIT 1'
    ).bind(currentOrder).first()

  // 端にいる場合は何もしない
  if (!neighbor) {
    return c.json({ success: true, message: '移動できるプロジェクトがありません' })
  }

  const neighborId = neighbor.id as string
  const neighborOrder = Number(neighbor.display_order)

  // display_orderを入れ替え
  await c.env.DB.prepare(
    'UPDATE projects SET display_order = ? WHERE id = ?'
  ).bind(neighborOrder, projectId).run()

  await c.env.DB.prepare(
    'UPDATE projects SET display_order = ? WHERE id = ?'
  ).bind(currentOrder, neighborId).run()

  return c.json({ success: true })
})

// プロジェクトのゲスト公開フラグ更新（admin専用）
app.put('/api/projects/:id/guest-visible', async (c) => {
  const projectId = c.req.param('id')
  const { userId, guestVisible } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // adminチェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user || user.username !== 'admin') {
    return c.json({ error: '権限がありません' }, 403)
  }

  const flag = guestVisible ? 1 : 0

  await c.env.DB.prepare(
    'UPDATE projects SET guest_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(flag, projectId).run()

  return c.json({ success: true, guestVisible: !!flag })
})

// ==================== ファイルマッピング（map-spots）API ====================

// プロジェクト配下の全ファイル一覧（file_type = 'file'、全子プロジェクト）
app.get('/api/projects/:id/files', async (c) => {
  const projectId = c.req.param('id')

  const files = await c.env.DB.prepare(`
    SELECT f.id, f.name, f.subproject_id, f.mime_type, f.file_type,
           s.name as subproject_name
    FROM files f
    JOIN subprojects s ON f.subproject_id = s.id
    WHERE s.project_id = ? AND f.file_type = 'file'
    ORDER BY s.display_order ASC, s.name ASC, f.name ASC
  `).bind(projectId).all()

  return c.json(files.results)
})

// スポット一覧（?floor=1 で階フィルタ）
app.get('/api/projects/:id/map-spots', async (c) => {
  const projectId = c.req.param('id')
  const floorQuery = c.req.query('floor')

  let query = `
    SELECT ms.*, u.username as created_by_name
    FROM map_spots ms
    LEFT JOIN users u ON ms.created_by = u.id
    WHERE ms.project_id = ?
  `
  const params: (string | number)[] = [projectId]
  if (floorQuery !== undefined && floorQuery !== '') {
    const floor = parseInt(floorQuery, 10)
    if (!Number.isNaN(floor)) {
      query += ' AND ms.floor = ?'
      params.push(floor)
    }
  }
  query += ' ORDER BY ms.display_order ASC, ms.created_at ASC'

  const spots = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(spots.results)
})

// スポット作成
app.post('/api/projects/:id/map-spots', async (c) => {
  const projectId = c.req.param('id')
  const body = await c.req.json()
  const { name, floor, x_percent, y_percent, userId } = body

  if (name == null || floor == null || x_percent == null || y_percent == null) {
    return c.json({ error: 'name, floor, x_percent, y_percent が必要です' }, 400)
  }

  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ?'
  ).bind(projectId).first()
  if (!project) {
    return c.json({ error: 'プロジェクトが見つかりません' }, 404)
  }

  const spotId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO map_spots (id, project_id, floor, name, x_percent, y_percent, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(spotId, projectId, Number(floor), String(name), Number(x_percent), Number(y_percent), userId || null).run()

  const spot = await c.env.DB.prepare(
    'SELECT ms.*, u.username as created_by_name FROM map_spots ms LEFT JOIN users u ON ms.created_by = u.id WHERE ms.id = ?'
  ).bind(spotId).first()

  return c.json(spot)
})

// スポット更新（所属チェック）
app.put('/api/projects/:id/map-spots/:spotId', async (c) => {
  const projectId = c.req.param('id')
  const spotId = c.req.param('spotId')
  const body = await c.req.json()

  const spot = await c.env.DB.prepare(
    'SELECT * FROM map_spots WHERE id = ? AND project_id = ?'
  ).bind(spotId, projectId).first()
  if (!spot) {
    return c.json({ error: 'スポットが見つかりません' }, 404)
  }

  const name = body.name !== undefined ? body.name : spot.name
  const floor = body.floor !== undefined ? body.floor : spot.floor
  const x_percent = body.x_percent !== undefined ? body.x_percent : spot.x_percent
  const y_percent = body.y_percent !== undefined ? body.y_percent : spot.y_percent
  const display_order = body.display_order !== undefined ? body.display_order : spot.display_order

  await c.env.DB.prepare(
    'UPDATE map_spots SET name = ?, floor = ?, x_percent = ?, y_percent = ?, display_order = ? WHERE id = ?'
  ).bind(name, floor, x_percent, y_percent, display_order, spotId).run()

  return c.json({ success: true })
})

// スポット削除（所属チェック、map_spot_files は CASCADE）
app.delete('/api/projects/:id/map-spots/:spotId', async (c) => {
  const projectId = c.req.param('id')
  const spotId = c.req.param('spotId')

  const spot = await c.env.DB.prepare(
    'SELECT id FROM map_spots WHERE id = ? AND project_id = ?'
  ).bind(spotId, projectId).first()
  if (!spot) {
    return c.json({ error: 'スポットが見つかりません' }, 404)
  }

  await c.env.DB.prepare('DELETE FROM map_spot_files WHERE spot_id = ?').bind(spotId).run()
  await c.env.DB.prepare('DELETE FROM map_spots WHERE id = ?').bind(spotId).run()

  return c.json({ success: true })
})

// スポットに紐づくファイル一覧
app.get('/api/projects/:id/map-spots/:spotId/files', async (c) => {
  const projectId = c.req.param('id')
  const spotId = c.req.param('spotId')

  const spot = await c.env.DB.prepare(
    'SELECT id FROM map_spots WHERE id = ? AND project_id = ?'
  ).bind(spotId, projectId).first()
  if (!spot) {
    return c.json({ error: 'スポットが見つかりません' }, 404)
  }

  const files = await c.env.DB.prepare(`
    SELECT f.id as file_id, f.name as file_name, s.name as subproject_name, f.mime_type,
           msf.display_order
    FROM map_spot_files msf
    JOIN files f ON msf.file_id = f.id
    JOIN subprojects s ON f.subproject_id = s.id
    WHERE msf.spot_id = ?
    ORDER BY msf.display_order ASC, f.name ASC
  `).bind(spotId).all()

  return c.json(files.results)
})

// スポットへのファイル割り当てを一括置き換え（他プロジェクトの file_id は 400）
app.put('/api/projects/:id/map-spots/:spotId/files', async (c) => {
  const projectId = c.req.param('id')
  const spotId = c.req.param('spotId')
  const { fileIds } = await c.req.json()

  const spot = await c.env.DB.prepare(
    'SELECT id FROM map_spots WHERE id = ? AND project_id = ?'
  ).bind(spotId, projectId).first()
  if (!spot) {
    return c.json({ error: 'スポットが見つかりません' }, 404)
  }

  const ids = Array.isArray(fileIds) ? fileIds : []
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',')
    const projectFiles = await c.env.DB.prepare(`
      SELECT f.id FROM files f
      JOIN subprojects s ON f.subproject_id = s.id
      WHERE s.project_id = ? AND f.file_type = 'file' AND f.id IN (${placeholders})
    `).bind(projectId, ...ids).all()

    if (projectFiles.results.length !== ids.length) {
      return c.json({ error: '指定されたファイルの一部がこのプロジェクトに属していません' }, 400)
    }
  }

  await c.env.DB.prepare('DELETE FROM map_spot_files WHERE spot_id = ?').bind(spotId).run()

  for (let i = 0; i < ids.length; i++) {
    await c.env.DB.prepare(
      'INSERT INTO map_spot_files (spot_id, file_id, display_order) VALUES (?, ?, ?)'
    ).bind(spotId, ids[i], i).run()
  }

  return c.json({ success: true })
})

// ==================== ファイルマッピング有効化・階地図 API ====================

// ファイルマッピング有効/無効（admin のみ）
app.put('/api/projects/:id/file-mapping-enabled', async (c) => {
  const projectId = c.req.param('id')
  const { userId, enabled } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()
  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者のみ設定できます' }, 403)
  }

  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ?'
  ).bind(projectId).first()
  if (!project) {
    return c.json({ error: 'プロジェクトが見つかりません' }, 404)
  }

  const flag = enabled ? 1 : 0
  await c.env.DB.prepare(
    'UPDATE projects SET file_mapping_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(flag, projectId).run()

  return c.json({ success: true, file_mapping_enabled: !!flag })
})

// 階地図一覧（presigned imageUrl 付き）
app.get('/api/projects/:id/floor-maps', async (c) => {
  const projectId = c.req.param('id')

  const project = await c.env.DB.prepare(
    'SELECT id, file_mapping_enabled FROM projects WHERE id = ?'
  ).bind(projectId).first()
  if (!project) {
    return c.json({ error: 'プロジェクトが見つかりません' }, 404)
  }

  const rows = await c.env.DB.prepare(
    'SELECT id, project_id, floor, name, r2_key, mime_type, display_order, created_at FROM project_floor_maps WHERE project_id = ? ORDER BY display_order ASC, floor ASC'
  ).bind(projectId).all()

  const results = (rows.results || []) as any[]
  const out: any[] = []

  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET && results.length > 0) {
    const s3Client = new S3Client({
      region: c.env.AWS_REGION || 'ap-northeast-1',
      credentials: {
        accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
      },
    })
    for (const row of results) {
      if (row.r2_key) {
        try {
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: c.env.S3_BUCKET, Key: row.r2_key }),
            { expiresIn: 3600 }
          )
          out.push({ ...row, imageUrl: url })
        } catch {
          out.push({ ...row, imageUrl: null })
        }
      } else {
        out.push({ ...row, imageUrl: null })
      }
    }
  } else {
    results.forEach(row => out.push({ ...row, imageUrl: null }))
  }

  return c.json(out)
})

// 階地図アップロード（admin のみ、multipart）
app.post('/api/projects/:id/floor-maps', async (c) => {
  const projectId = c.req.param('id')
  const formData = await c.req.formData()
  const userId = (formData.get('userId') as string) || ''

  const guard = denyGuest(c, userId)
  if (guard) return guard

  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()
  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者のみ地図を追加できます' }, 403)
  }

  const project = await c.env.DB.prepare(
    'SELECT id, file_mapping_enabled FROM projects WHERE id = ?'
  ).bind(projectId).first()
  if (!project) {
    return c.json({ error: 'プロジェクトが見つかりません' }, 404)
  }
  if (!(project as any).file_mapping_enabled) {
    return c.json({ error: 'このプロジェクトではファイルマッピングが無効です' }, 400)
  }

  if (!c.env.AWS_ACCESS_KEY_ID || !c.env.AWS_SECRET_ACCESS_KEY || !c.env.S3_BUCKET) {
    return c.json({ error: 'AWS設定が完了していません' }, 500)
  }

  const file = formData.get('file') as any
  const floorStr = formData.get('floor')
  const name = (formData.get('name') as string) || ''

  if (!file || typeof file === 'string') {
    return c.json({ error: '画像ファイルが必要です' }, 400)
  }
  const floor = floorStr != null ? parseInt(String(floorStr), 10) : NaN
  if (Number.isNaN(floor) || floor < 1) {
    return c.json({ error: '階(1以上の数値)が必要です' }, 400)
  }

  const mimeType = file.type || 'image/png'
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const mapId = generateUuid()
  const s3Key = `maps/${projectId}/${mapId}.${ext}`

  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  const body = await file.arrayBuffer()
  await s3Client.send(new PutObjectCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    Body: new Uint8Array(body),
    ContentType: mimeType,
  }))

  const existing = await c.env.DB.prepare(
    'SELECT id, r2_key FROM project_floor_maps WHERE project_id = ? AND floor = ?'
  ).bind(projectId, floor).first()

  if (existing) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: (existing as any).r2_key,
      }))
    } catch (_) {}
    await c.env.DB.prepare(
      'UPDATE project_floor_maps SET r2_key = ?, mime_type = ?, name = ? WHERE project_id = ? AND floor = ?'
    ).bind(s3Key, mimeType, name || `F${floor}`, projectId, floor).run()
    const updated = await c.env.DB.prepare(
      'SELECT * FROM project_floor_maps WHERE project_id = ? AND floor = ?'
    ).bind(projectId, floor).first()
    return c.json(updated)
  }

  const displayOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM project_floor_maps WHERE project_id = ?'
  ).bind(projectId).first()
  const order = (displayOrder as any)?.next_order ?? 0

  await c.env.DB.prepare(
    'INSERT INTO project_floor_maps (id, project_id, floor, name, r2_key, mime_type, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(mapId, projectId, floor, name || `F${floor}`, s3Key, mimeType, order).run()

  const created = await c.env.DB.prepare(
    'SELECT * FROM project_floor_maps WHERE id = ?'
  ).bind(mapId).first()
  return c.json(created)
})

// 階地図削除（admin のみ）
app.delete('/api/projects/:id/floor-maps/:mapId', async (c) => {
  const projectId = c.req.param('id')
  const mapId = c.req.param('mapId')

  const userId = (await c.req.json().catch(() => ({}))).userId
  const guard = denyGuest(c, userId)
  if (guard) return guard

  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()
  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者のみ地図を削除できます' }, 403)
  }

  const row = await c.env.DB.prepare(
    'SELECT id, r2_key FROM project_floor_maps WHERE id = ? AND project_id = ?'
  ).bind(mapId, projectId).first()
  if (!row) {
    return c.json({ error: '地図が見つかりません' }, 404)
  }

  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET && (row as any).r2_key) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
        },
      })
      await s3Client.send(new DeleteObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: (row as any).r2_key,
      }))
    } catch (_) {}
  }

  await c.env.DB.prepare(
    'DELETE FROM project_floor_maps WHERE id = ? AND project_id = ?'
  ).bind(mapId, projectId).run()

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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
  const sortField = c.req.query('sortField') || 'display_order'
  const sortOrder = c.req.query('sortOrder') || 'asc'

  // 許可されたソートフィールドと順序
  const allowedFields = ['name', 'display_order', 'created_at']
  const allowedOrders = ['asc', 'desc']

  const field = allowedFields.includes(sortField) ? sortField : 'display_order'
  const order = allowedOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'ASC'

  // デフォルトのソート順以外の場合のクエリ構築
  let query = `SELECT * FROM subprojects WHERE project_id = ? ORDER BY ${field} ${order}`

  // display_orderの場合は、同じ順序なら作成日時順にするなど、2次ソートも考慮可能だが、
  // ここではシンプルに指定フィールドのみ、ただしデフォルトと同じ挙動を保つため
  // display_orderの場合は created_at DESC を付ける
  if (field === 'display_order') {
    query += ', created_at DESC'
  }

  const subprojects = await c.env.DB.prepare(query).bind(projectId).all()

  return c.json(subprojects.results)
})

// 子プロジェクト単体取得
app.get('/api/subprojects/:id', async (c) => {
  const subprojectId = c.req.param('id')

  if (!isValidUuid(subprojectId)) {
    return c.json({ error: '無効な子プロジェクトIDです' }, 400)
  }

  const subproject = await c.env.DB.prepare(
    'SELECT * FROM subprojects WHERE id = ?'
  ).bind(subprojectId).first()

  if (!subproject) {
    return c.json({ error: '子プロジェクトが見つかりません' }, 404)
  }

  return c.json(subproject)
})

// 子プロジェクト作成
app.post('/api/projects/:id/subprojects', async (c) => {
  const projectId = c.req.param('id')
  const { name, description } = await c.req.json()

  const subprojectId = generateUuid()

  await c.env.DB.prepare(
    'INSERT INTO subprojects (id, project_id, name, description) VALUES (?, ?, ?, ?)'
  ).bind(subprojectId, projectId, name, description).run()

  return c.json({ success: true, subprojectId })
})

// 子プロジェクト削除
app.delete('/api/subprojects/:id', async (c) => {
  const subprojectId = c.req.param('id')
  const { userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

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

// 子プロジェクト並び順更新
app.put('/api/projects/:id/subprojects/reorder', async (c) => {
  const projectId = c.req.param('id')
  try {
    const { orders } = await c.req.json()

    if (!Array.isArray(orders)) {
      return c.json({ error: '無効なリクエストです' }, 400)
    }

    console.log(`[v20260103-FIX-NO-BIND] Processing ${orders.length} subproject reorders for project ${projectId} (Direct SQL)`)

    for (const item of orders) {
      const orderVal = Number(item.displayOrder)
      // サニタイズ
      let idVal = String(item.id)
      let projectIdVal = String(projectId)

      if (isNaN(orderVal)) {
        console.error('Invalid displayOrder for subproject:', item)
        continue
      }

      // IDチェック
      if (!/^[a-zA-Z0-9-]+$/.test(idVal) || !/^[a-zA-Z0-9-]+$/.test(projectIdVal)) {
        console.error('Invalid ID format:', idVal, projectIdVal)
        continue
      }

      console.log(`Updating Subproject: id=${idVal}, order=${orderVal}`)

      // bind不使用
      await c.env.DB.prepare(
        `UPDATE subprojects SET display_order = ${orderVal} WHERE id = '${idVal}' AND project_id = '${projectIdVal}'`
      ).run()
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Subproject Reorder Error:', error)
    if (typeof error === 'object') {
      console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)))
    }
    return c.json({ error: '並び順の更新に失敗しました' }, 500)
  }
})

// ==================== APIキー API ====================

// APIキー生成用のシークレットキーを取得
function getJwtSecret(env: Bindings): Uint8Array {
  const secret = env.JWT_SECRET || 'conagit-default-secret-key-change-in-production'
  return new (globalThis as any).TextEncoder().encode(secret)
}

// APIキーのハッシュ化（簡易実装、本番環境ではbcrypt推奨）
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new (globalThis as any).TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await cryptoImpl.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// APIキー検証ミドルウェア
async function verifyApiKey(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'APIキーが必要です' }, 401)
  }

  const apiKey = authHeader.substring(7) // "Bearer " を除去

  try {
    // JWTを検証
    const secret = getJwtSecret(c.env)
    const { payload } = await jwtVerify(apiKey, secret)

    const userId = payload.userId as string
    const subprojectId = payload.projectId as string

    if (!isValidUuid(userId) || !isValidUuid(subprojectId)) {
      return c.json({ error: '無効なAPIキーです' }, 401)
    }

    // APIキーのハッシュを確認
    const apiKeyHash = await hashApiKey(apiKey)
    const existingKey = await c.env.DB.prepare(
      'SELECT * FROM api_keys WHERE user_id = ? AND subproject_id = ? AND api_key_hash = ?'
    ).bind(userId, subprojectId, apiKeyHash).first()

    if (!existingKey) {
      return c.json({ error: '無効なAPIキーです' }, 401)
    }

    // 最終使用日時を更新
    await c.env.DB.prepare(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(existingKey.id).run()

      // コンテキストにユーザー情報を追加
      ; (c as any).set('apiUserId', userId)
      ; (c as any).set('apiSubprojectId', subprojectId)

    return null // 検証成功
  } catch (error) {
    console.error('APIキー検証エラー:', error)
    return c.json({ error: '無効なAPIキーです' }, 401)
  }
}

// APIキー生成エンドポイント
app.post('/api/subprojects/:id/api-keys', async (c) => {
  const subprojectId = c.req.param('id')
  const { userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  if (!isValidUuid(userId)) {
    return c.json({ error: 'ユーザーIDが必要です' }, 400)
  }

  // ユーザーとサブプロジェクトの存在確認
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }

  const subproject = await c.env.DB.prepare(
    'SELECT * FROM subprojects WHERE id = ?'
  ).bind(subprojectId).first()

  if (!subproject) {
    return c.json({ error: '子プロジェクトが見つかりません' }, 404)
  }

  // 既存のAPIキーをチェック
  const existingKey = await c.env.DB.prepare(
    'SELECT * FROM api_keys WHERE user_id = ? AND subproject_id = ?'
  ).bind(userId, subprojectId).first()

  // JWTトークンを生成
  const secret = getJwtSecret(c.env)
  const jwt = await new SignJWT({
    userId: userId,
    projectId: subprojectId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(secret)

  // APIキーをハッシュ化してDBに保存
  const apiKeyHash = await hashApiKey(jwt)

  if (existingKey) {
    // 既存のキーを更新
    await c.env.DB.prepare(
      'UPDATE api_keys SET api_key_hash = ?, created_at = CURRENT_TIMESTAMP, last_used_at = NULL WHERE id = ?'
    ).bind(apiKeyHash, existingKey.id).run()
  } else {
    // 新規作成
    await c.env.DB.prepare(
      'INSERT INTO api_keys (user_id, subproject_id, api_key_hash) VALUES (?, ?, ?)'
    ).bind(userId, subprojectId, apiKeyHash).run()
  }

  // プレーンテキストのAPIキーを返す（この時だけ表示）
  return c.json({ success: true, apiKey: jwt })
})

// APIキー取得エンドポイント（存在確認のみ）
app.get('/api/subprojects/:id/api-keys', async (c) => {
  const subprojectId = c.req.param('id')
  const userId = c.req.query('userId')

  const guard = denyGuest(c, userId)
  if (guard) return guard

  if (!userId || !isValidUuid(userId)) {
    return c.json({ error: 'ユーザーIDが必要です' }, 400)
  }

  const existingKey = await c.env.DB.prepare(
    'SELECT * FROM api_keys WHERE user_id = ? AND subproject_id = ?'
  ).bind(userId, subprojectId).first()

  return c.json({ hasApiKey: !!existingKey })
})

// ZIPアップロードエンドポイント（APIキー認証）
app.post('/api/subprojects/:id/upload-zip', async (c) => {
  // APIキー検証
  const verifyResult = await verifyApiKey(c)
  if (verifyResult) {
    return verifyResult
  }

  const subprojectId = (c as any).get('apiSubprojectId')
  const userId = (c as any).get('apiUserId')

  // ユーザー名を取得
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }

  const username = user.username as string

  // multipart/form-dataからファイルを取得
  const formData = await c.req.formData()
  const file = formData.get('file') as any
  let fileName = formData.get('fileName') as string

  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 400)
  }

  // ファイル名が提供されていない場合、またはユーザー名が含まれていない場合は追加
  if (!fileName) {
    return c.json({ error: 'ファイル名が必要です' }, 400)
  }

  // ファイル名にユーザー名が含まれていない場合は追加（形式: user@directory_YYYYMMDD.zip）
  if (!fileName.includes('@')) {
    // 既存のファイル名からディレクトリ名と日付を抽出
    const parts = fileName.replace('.zip', '').split('_')
    const directoryName = parts[0]
    const dateStr = parts.length > 1 ? parts[parts.length - 1] : new Date().toISOString().slice(0, 10).replace(/-/g, '')
    fileName = `${username}@${directoryName}_${dateStr}.zip`
  }

  // AWS認証情報の確認
  if (!c.env.AWS_ACCESS_KEY_ID || !c.env.AWS_SECRET_ACCESS_KEY || !c.env.S3_BUCKET) {
    return c.json({ error: 'AWS設定が完了していません' }, 500)
  }

  // 既存ファイル確認（同名・ルートパス）
  const existingFile = await c.env.DB.prepare(
    'SELECT * FROM files WHERE subproject_id = ? AND name = ? AND path = ? AND file_type = ?'
  ).bind(subprojectId, fileName, '/', 'file').first()

  const fileId = existingFile ? (existingFile.id as string) : generateUuid()
  const s3Key = `files/${subprojectId}/${fileId}/${fileName}`

  if (existingFile) {
    await c.env.DB.prepare(
      'UPDATE files SET file_size = ?, mime_type = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(file.size, 'application/zip', userId, fileId).run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(fileId, subprojectId, fileName, '/', 'file', 'application/zip', file.size, userId).run()
  }

  // S3クライアントの作成
  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  // ファイルをArrayBufferに変換
  const fileBuffer = await file.arrayBuffer()

  // S3にアップロード
  const command = new PutObjectCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    ContentType: 'application/zip',
    Body: new Uint8Array(fileBuffer),
  })

  await s3Client.send(command)

  // D1のr2_keyを更新（実際はs3_key）
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(s3Key, fileId).run()

  // プロジェクトIDを取得
  const subproject = await c.env.DB.prepare(
    'SELECT project_id FROM subprojects WHERE id = ?'
  ).bind(subprojectId).first()

  const projectId = subproject?.project_id as number

  // タイムラインに記録
  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${fileName}をアップロードしました（CLI経由）`).run()
  notifyDiscord(c.env, `${fileName}をアップロードしました（CLI経由）`)

  return c.json({ success: true, fileId })
})

// ==================== ファイル API ====================

// ファイル一覧取得（階層構造対応）
app.get('/api/subprojects/:id/files', async (c) => {
  const subprojectId = c.req.param('id')
  const path = c.req.query('path') || '/'
  const sortField = c.req.query('sortField') || 'default'
  const sortOrder = c.req.query('sortOrder') || 'asc'

  let orderByClause = 'ORDER BY f.file_type DESC, f.name ASC'

  if (sortField !== 'default') {
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC'

    switch (sortField) {
      case 'name':
        orderByClause = `ORDER BY f.name ${order}`
        break
      case 'file_size':
        orderByClause = `ORDER BY f.file_size ${order}`
        break
      case 'updated_at':
        orderByClause = `ORDER BY f.updated_at ${order}`
        break
      case 'file_type':
        orderByClause = `ORDER BY f.file_type ${order}, f.name ASC`
        break
      case 'mime_type':
        orderByClause = `ORDER BY f.mime_type ${order}, f.name ASC`
        break
      case 'updated_by':
        // usersテーブルをJOINしているので u.username でソート可能
        orderByClause = `ORDER BY u.username ${order}, f.name ASC`
        break
    }
  }

  const files = await c.env.DB.prepare(`
    SELECT f.*, u.username as updated_by_name
    FROM files f
    JOIN users u ON f.updated_by = u.id
    WHERE f.subproject_id = ? AND f.path = ?
    ${orderByClause}
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

// 全体ファイル検索（ファイル名で検索、ゲストは不可）
app.get('/api/files/search', async (c) => {
  const userId = c.req.query('userId')
  const q = (c.req.query('q') || '').trim()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  if (!q) {
    return c.json([])
  }

  const like = `%${q}%`
  const files = await c.env.DB.prepare(`
    SELECT f.id, f.name, f.path, f.subproject_id, f.file_type,
           s.name as subproject_name, s.project_id,
           p.name as project_name
    FROM files f
    JOIN subprojects s ON f.subproject_id = s.id
    JOIN projects p ON s.project_id = p.id
    WHERE f.file_type = 'file' AND (f.name LIKE ? OR f.path LIKE ?)
    ORDER BY f.name ASC
    LIMIT 50
  `).bind(like, like).all()

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // 既に存在するフォルダかチェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM files WHERE subproject_id = ? AND name = ? AND path = ? AND file_type = ?'
  ).bind(subprojectId, name, path, 'folder').first()

  if (existing) {
    return c.json({ success: true, folderId: existing.id, alreadyExists: true })
  }

  const folderId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, updated_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(folderId, subprojectId, name, path, 'folder', userId).run()

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // まずD1にメタデータを保存（fileIdを取得するため）
  const fileId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(fileId, subprojectId, name, path || '/', 'file', mimeType, fileSize || 0, userId).run()

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
  notifyDiscord(c.env, `${name}を作成しました`)

  return c.json({ success: true, fileId })
})

// Presigned URL生成（S3直接アップロード用）
app.post('/api/subprojects/:id/files/presigned-url', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileName, fileSize, mimeType, path, userId, projectId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // アップロードのサイズ制限（CLI向けに500GBまで緩和）
  const MAX_FILE_SIZE = 500 * 1024 * 1024 * 1024
  if (fileSize > MAX_FILE_SIZE) {
    return c.json({
      error: 'ファイルサイズが大きすぎます',
      message: `アップロード上限は 500GB です。現在のファイル: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB`,
      maxSizeGB: 500,
      fileSizeGB: (fileSize / 1024 / 1024 / 1024).toFixed(2)
    }, 400)
  }

  // AWS認証情報の確認
  if (!c.env.AWS_ACCESS_KEY_ID || !c.env.AWS_SECRET_ACCESS_KEY || !c.env.S3_BUCKET) {
    return c.json({ error: 'AWS設定が完了していません' }, 500)
  }

  // D1にメタデータを保存
  const fileId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(fileId, subprojectId, fileName, path || '/', 'file', mimeType, fileSize || 0, userId).run()
  const s3Key = `files/${subprojectId}/${fileId}/${fileName}`

  // S3クライアントの作成
  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  // Presigned URLを生成（15分間有効）
  const command = new PutObjectCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    ContentType: mimeType || 'application/octet-stream',
  })

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1時間

  return c.json({
    success: true,
    fileId,
    presignedUrl,
    s3Key,
    callbackUrl: `/api/subprojects/${subprojectId}/files/${fileId}/upload-complete`
  })
})

// --- S3 マルチパートアップロード ---

// 1. マルチパートアップロード開始
app.post('/api/subprojects/:id/files/multipart-start', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileName, fileSize, mimeType, path, userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  if (!c.env.AWS_ACCESS_KEY_ID || !c.env.AWS_SECRET_ACCESS_KEY || !c.env.S3_BUCKET) {
    return c.json({ error: 'AWS設定が完了していません' }, 500)
  }

  const fileId = generateUuid()
  const s3Key = `files/${subprojectId}/${fileId}/${fileName}`

  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  const command = new CreateMultipartUploadCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    ContentType: mimeType || 'application/zip',
  })

  const response = await s3Client.send(command)

  // メタデータをD1に保存
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(fileId, subprojectId, fileName, path || '/', 'file', mimeType, fileSize, userId).run()

  return c.json({
    success: true,
    fileId,
    uploadId: response.UploadId,
    s3Key
  })
})

// 2. 各パーツのPresigned URL取得
app.post('/api/subprojects/:id/files/multipart-url', async (c) => {
  const { s3Key, uploadId, partNumber } = await c.req.json()

  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  const command = new UploadPartCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

  return c.json({
    success: true,
    presignedUrl
  })
})

// 3. マルチパートアップロード完了
app.post('/api/subprojects/:id/files/multipart-complete', async (c) => {
  const subprojectId = c.req.param('id')
  const { fileId, s3Key, uploadId, parts, userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  const s3Client = new S3Client({
    region: c.env.AWS_REGION || 'ap-northeast-1',
    credentials: {
      accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
    },
  })

  const command = new CompleteMultipartUploadCommand({
    Bucket: c.env.S3_BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a: any, b: any) => a.PartNumber - b.PartNumber)
    }
  })

  await s3Client.send(command)

  // D1のr2_keyを更新
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(s3Key, fileId).run()

  // タイムライン記録
  const subproject = await c.env.DB.prepare(
    'SELECT project_id FROM subprojects WHERE id = ?'
  ).bind(subprojectId).first()
  const projectId = subproject?.project_id as string

  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${s3Key.split('/').pop()}を大容量アップロードしました`).run()
  notifyDiscord(c.env, `${s3Key.split('/').pop()}を大容量アップロードしました`)

  return c.json({ success: true })
})

// --- 既存のアップロード完了通知 ---
app.post('/api/subprojects/:id/files/:fileId/upload-complete', async (c) => {
  const subprojectId = c.req.param('id')
  const fileId = c.req.param('fileId')
  const { s3Key, userId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // D1のr2_key（実際はs3_key）を更新
  await c.env.DB.prepare(
    'UPDATE files SET r2_key = ? WHERE id = ?'
  ).bind(s3Key, fileId).run()

  // タイムラインに記録
  const subproject = await c.env.DB.prepare(
    'SELECT project_id FROM subprojects WHERE id = ?'
  ).bind(subprojectId).first()
  const projectId = subproject?.project_id as string | undefined
  if (!projectId) {
    return c.json({ error: '子プロジェクトの親プロジェクトが見つかりません' }, 500)
  }

  await c.env.DB.prepare(
    'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(projectId, userId, fileId, 'created', `${s3Key.split('/').pop()}を作成しました`).run()
  notifyDiscord(c.env, `${s3Key.split('/').pop()}を作成しました`)

  return c.json({ success: true })
})

// チャンクアップロード開始（メタデータ作成）- 後方互換性のため残す
app.post('/api/subprojects/:id/files/chunk-start', async (c) => {
  const subprojectId = c.req.param('id')
  const { name, path, userId, projectId, mimeType, fileSize, totalChunks } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // D1にメタデータを保存（チャンクアップロード中フラグ付き）
  const fileId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(fileId, subprojectId, name, path || '/', 'file', mimeType, fileSize || 0, userId).run()
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
    uploadContent = new TextEncoder().encode(chunkData).buffer
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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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

    const chunkData = await (chunkObject as any).arrayBuffer()
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
  notifyDiscord(c.env, `${r2Key.split('/').pop()}を作成しました`)

  return c.json({ success: true, fileId })
})

// 複数ファイル一括アップロード
app.post('/api/subprojects/:id/files/batch', async (c) => {
  const subprojectId = c.req.param('id')
  const { files, userId, projectId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  const fileIds = []

  for (const file of files) {
    // まずD1にメタデータを保存（fileIdを取得するため）
    const fileId = generateUuid()
    await c.env.DB.prepare(
      'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(fileId, subprojectId, file.name, file.path || '/', 'file', file.mimeType, file.fileSize || 0, userId).run()
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
  notifyDiscord(c.env, `${files.length}個のファイルをアップロードしました`)

  return c.json({ success: true, fileIds })
})

// ファイル更新
app.put('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { name, content, userId, projectId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

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
      uploadContent = new TextEncoder().encode(content).buffer
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
  notifyDiscord(c.env, `${name}を更新しました`)

  return c.json({ success: true })
})

// すべての子フォルダーとファイルを再帰的に取得するヘルパー関数
async function getAllChildrenRecursive(
  db: D1Database,
  subprojectId: number,
  folderPath: string
): Promise<any[]> {
  const results = [];

  // 直接の子要素を取得（ファイルとフォルダー両方）
  const children = await db.prepare(`
    SELECT * FROM files 
    WHERE subproject_id = ? AND path = ?
    ORDER BY file_type DESC, name ASC
  `).bind(subprojectId, folderPath).all();

  for (const child of children.results) {
    results.push(child);

    // 子要素がフォルダーの場合、再帰的に取得
    if (child.file_type === 'folder') {
      const childPath = `${folderPath === '/' ? '' : folderPath}/${child.name}`;
      const grandchildren = await getAllChildrenRecursive(db, subprojectId, childPath);
      results.push(...grandchildren);
    }
  }

  return results;
}

// ファイル削除（S3対応、フォルダ配下のファイルも削除）
app.delete('/api/files/:id', async (c) => {
  const fileId = c.req.param('id')
  const { userId, projectId, fileName } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

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
    // 再帰的にすべての子要素を取得
    const allChildren = await getAllChildrenRecursive(
      c.env.DB,
      existingFile.subproject_id,
      folderPath
    );

    // 深い階層から順に削除（depth DESC）
    const sortedChildren = allChildren.sort((a, b) => {
      const aDepth = a.path.split('/').filter((p: string) => p).length;
      const bDepth = b.path.split('/').filter((p: string) => p).length;
      return bDepth - aDepth; // 深い方から削除
    });

    // 各ファイル/フォルダーを削除
    for (const file of sortedChildren) {
      if (file.file_type === 'file') {
        await deleteFileFromStorage(file, c.env);
      }
      await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run();
    }

    console.log(`[DELETE] Deleted ${sortedChildren.length} children`);
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
  notifyDiscord(c.env, `${itemType} ${fileName}を削除しました`)

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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

  const guard = denyGuest(c, userId)
  if (guard) return guard

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
  const newFileId = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    newFileId,
    newSubprojectId,
    copiedName,
    newPath,
    file.file_type,
    file.mime_type,
    file.file_size,
    userId,
    file.r2_key // 同じS3キーを参照（またはコピーが必要な場合は後で処理）
  ).run()

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
      const newChildId = generateUuid()
      await c.env.DB.prepare(
        'INSERT INTO files (id, subproject_id, name, path, file_type, mime_type, file_size, updated_by, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        newChildId,
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

// 全プロジェクトの直近のタイムライン取得（limit, offset, userId, projectId, dateFrom, dateTo 対応）
app.get('/api/timeline/recent', async (c) => {
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '100')))
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'))
  const userId = c.req.query('userId') || null
  const projectId = c.req.query('projectId') || null
  const dateFrom = c.req.query('dateFrom') || null // YYYY-MM-DD
  const dateTo = c.req.query('dateTo') || null   // YYYY-MM-DD

  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (userId) {
    conditions.push('t.user_id = ?')
    bindings.push(userId)
  }
  if (projectId) {
    conditions.push('t.project_id = ?')
    bindings.push(projectId)
  }
  if (dateFrom) {
    conditions.push("date(t.created_at) >= date(?)")
    bindings.push(dateFrom)
  }
  if (dateTo) {
    conditions.push("date(t.created_at) <= date(?)")
    bindings.push(dateTo)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const timeline = await c.env.DB.prepare(`
    SELECT t.*, u.username, f.name as file_name, p.name as project_name, p.id as project_id
    FROM timeline t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN files f ON t.file_id = f.id
    JOIN projects p ON t.project_id = p.id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all()

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

// ==================== 担当プロジェクト API ====================

const validMemberProjectStatus = (status: string) => ['in_progress', 'pending'].includes(status)

// 全子プロジェクト一覧取得（選択肢用）
app.get('/api/all-subprojects', async (c) => {
  const subprojects = await c.env.DB.prepare(`
    SELECT s.id, s.name, s.project_id, p.name as project_name
    FROM subprojects s
    JOIN projects p ON s.project_id = p.id
    ORDER BY p.name ASC, s.name ASC
  `).all()

  return c.json(subprojects.results)
})

// 担当プロジェクト一覧取得（全ユーザーまたは特定ユーザー、プロジェクト有無に関わらず全ユーザー返す）
// achieved=1: 達成済みのみ（ユーザーごと）。未指定: 未達成のみ。
app.get('/api/member-projects', async (c) => {
  const requesterId = c.req.query('requesterId')
  const targetUserId = c.req.query('userId')
  const achievedOnly = c.req.query('achieved') === '1'

  if (!requesterId) {
    return c.json({ error: 'requesterIdが必要です' }, 400)
  }

  let requester: { id: string, username: string } | null = null
  let isAdmin = false

  if (requesterId === 'guest') {
    requester = { id: 'guest', username: 'guest' }
    isAdmin = false
  } else {
    if (!isValidUuid(requesterId)) {
      return c.json({ error: 'requesterIdが必要です' }, 400)
    }

    requester = await c.env.DB.prepare(
      'SELECT id, username FROM users WHERE id = ?'
    ).bind(requesterId).first()

    if (!requester) {
      return c.json({ error: 'リクエストユーザーが見つかりません' }, 404)
    }

    isAdmin = requester.username === 'admin'
  }

  // 1. 全ユーザーを取得（admin を常に除外）
  let usersQuery = 'SELECT id, username, email FROM users WHERE username != ?'
  const usersParams: any[] = ['admin']

  if (targetUserId && isValidUuid(targetUserId)) {
    usersQuery += ' AND id = ?'
    usersParams.push(targetUserId)
  }

  usersQuery += ' ORDER BY username ASC'

  const users = await c.env.DB.prepare(usersQuery).bind(...usersParams).all()

  // 2. 担当プロジェクトを取得（子プロジェクト情報も含める）
  let projectsQuery = `
    SELECT mp.*, 
           s.name as subproject_name, 
           p.name as project_name,
           s.project_id as parent_project_id
    FROM member_projects mp
    LEFT JOIN subprojects s ON mp.subproject_id = s.id
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE 1=1
  `
  const projectsParams: any[] = []

  if (achievedOnly) {
    projectsQuery += ' AND mp.achieved_at IS NOT NULL'
  } else {
    projectsQuery += ' AND mp.achieved_at IS NULL'
  }

  if (targetUserId && isValidUuid(targetUserId)) {
    projectsQuery += ' AND mp.user_id = ?'
    projectsParams.push(targetUserId)
  }

  projectsQuery += achievedOnly
    ? ' ORDER BY mp.achieved_at DESC, mp.created_at DESC'
    : ' ORDER BY mp.display_order ASC, mp.created_at DESC'

  // admin を除外した users リストに紐づくものだけ後でマッピングするため、ここでは全件取得
  const projects = await c.env.DB.prepare(projectsQuery).bind(...projectsParams).all()

  // 3. データを結合
  const result = users.results
    // 念のため admin を二重除外
    .filter((user: any) => user.username !== 'admin')
    .map((user: any) => {
      const userProjects = (projects.results as any[]).filter((p: any) => p.user_id === user.id)
      return {
        ...user,
        projects: userProjects
      }
    })

  return c.json(result)
})

// 担当プロジェクト作成
app.post('/api/member-projects', async (c) => {
  const { userId, requesterId, title, status, subprojectId, dueDate } = await c.req.json()

  const guardUser = denyGuest(c, userId)
  if (guardUser) return guardUser
  const guardRequester = denyGuest(c, requesterId)
  if (guardRequester) return guardRequester

  if (!userId || !requesterId || !title || !status) {
    return c.json({ error: 'userId, requesterId, title, status が必要です' }, 400)
  }
  if (!isValidUuid(userId) || !isValidUuid(requesterId)) {
    return c.json({ error: '無効なユーザーIDです' }, 400)
  }
  if (!validMemberProjectStatus(status)) {
    return c.json({ error: 'statusは in_progress または pending が必要です' }, 400)
  }

  const requester = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(requesterId).first()

  if (!requester) {
    return c.json({ error: 'リクエストユーザーが見つかりません' }, 404)
  }

  const isAdmin = requester.username === 'admin'
  if (!isAdmin && requesterId !== userId) {
    return c.json({ error: '他ユーザーの担当プロジェクトを作成できません' }, 403)
  }

  // 子プロジェクトIDが指定されている場合、存在確認
  let subprojectIdVal: string | null = null
  if (subprojectId) {
    if (!isValidUuid(subprojectId)) {
      return c.json({ error: 'subprojectIdが無効です' }, 400)
    }
    const subproject = await c.env.DB.prepare(
      'SELECT id FROM subprojects WHERE id = ?'
    ).bind(subprojectId).first()
    if (!subproject) {
      return c.json({ error: '指定された子プロジェクトが見つかりません' }, 404)
    }
    subprojectIdVal = subprojectId
  }

  const orderResult = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(display_order), -1) as max_order FROM member_projects WHERE user_id = ? AND achieved_at IS NULL'
  ).bind(userId).first()
  const nextOrder = (orderResult?.max_order as number ?? -1) + 1

  const dueDateVal = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate).trim()) ? String(dueDate).trim() : null

  const id = generateUuid()
  await c.env.DB.prepare(
    'INSERT INTO member_projects (id, user_id, title, status, display_order, subproject_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, title, status, nextOrder, subprojectIdVal, dueDateVal).run()

  return c.json({ success: true, id })
})

// 担当プロジェクト更新
app.put('/api/member-projects/:id', async (c) => {
  const memberProjectId = c.req.param('id')
  const { requesterId, title, status, subprojectId, dueDate } = await c.req.json()

  const guardRequester = denyGuest(c, requesterId)
  if (guardRequester) return guardRequester

  if (!requesterId || !isValidUuid(requesterId)) {
    return c.json({ error: 'requesterIdが必要です' }, 400)
  }
  if (status && !validMemberProjectStatus(status)) {
    return c.json({ error: 'statusは in_progress または pending が必要です' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT mp.*, u.username FROM member_projects mp JOIN users u ON mp.user_id = u.id WHERE mp.id = ?'
  ).bind(memberProjectId).first()

  if (!existing) {
    return c.json({ error: '担当プロジェクトが見つかりません' }, 404)
  }

  if (existing.achieved_at) {
    return c.json({ error: '達成済みの担当プロジェクトは編集できません' }, 400)
  }

  const requester = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(requesterId).first()

  if (!requester) {
    return c.json({ error: 'リクエストユーザーが見つかりません' }, 404)
  }

  const isAdmin = requester.username === 'admin'
  if (!isAdmin && existing.user_id !== requesterId) {
    return c.json({ error: '権限がありません' }, 403)
  }

  const newTitle = title || existing.title
  const newStatus = status || existing.status
  let newDueDate: string | null = (existing.due_date as string | null) ?? null
  if (dueDate !== undefined) {
    newDueDate = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate).trim()) ? String(dueDate).trim() : null
  }

  let newSubprojectId: string | null = existing.subproject_id as string | null
  if (subprojectId !== undefined) {
    if (subprojectId === null || subprojectId === '') {
      newSubprojectId = null
    } else {
      if (!isValidUuid(subprojectId)) {
        return c.json({ error: 'subprojectIdが無効です' }, 400)
      }
      const subproject = await c.env.DB.prepare(
        'SELECT id FROM subprojects WHERE id = ?'
      ).bind(subprojectId).first()
      if (!subproject) {
        return c.json({ error: '指定された子プロジェクトが見つかりません' }, 404)
      }
      newSubprojectId = subprojectId
    }
  }

  await c.env.DB.prepare(
    'UPDATE member_projects SET title = ?, status = ?, subproject_id = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newTitle, newStatus, newSubprojectId, newDueDate, memberProjectId).run()

  return c.json({ success: true })
})

// 担当プロジェクトを達成として記録
app.post('/api/member-projects/:id/achieve', async (c) => {
  const memberProjectId = c.req.param('id')
  const { requesterId } = await c.req.json()

  const guardRequester = denyGuest(c, requesterId)
  if (guardRequester) return guardRequester

  if (!requesterId || !isValidUuid(requesterId)) {
    return c.json({ error: 'requesterIdが必要です' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT mp.*, u.username FROM member_projects mp JOIN users u ON mp.user_id = u.id WHERE mp.id = ?'
  ).bind(memberProjectId).first()

  if (!existing) {
    return c.json({ error: '担当プロジェクトが見つかりません' }, 404)
  }

  const requester = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(requesterId).first()

  if (!requester) {
    return c.json({ error: 'リクエストユーザーが見つかりません' }, 404)
  }

  const isAdmin = requester.username === 'admin'
  if (!isAdmin && existing.user_id !== requesterId) {
    return c.json({ error: '権限がありません' }, 403)
  }

  if (existing.achieved_at) {
    return c.json({ success: true })
  }

  await c.env.DB.prepare(
    'UPDATE member_projects SET achieved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(memberProjectId).run()

  return c.json({ success: true })
})

// 担当プロジェクト削除
app.delete('/api/member-projects/:id', async (c) => {
  const memberProjectId = c.req.param('id')
  const { requesterId } = await c.req.json()

  const guardRequester = denyGuest(c, requesterId)
  if (guardRequester) return guardRequester

  if (!requesterId || !isValidUuid(requesterId)) {
    return c.json({ error: 'requesterIdが必要です' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT mp.*, u.username FROM member_projects mp JOIN users u ON mp.user_id = u.id WHERE mp.id = ?'
  ).bind(memberProjectId).first()

  if (!existing) {
    return c.json({ error: '担当プロジェクトが見つかりません' }, 404)
  }

  const requester = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE id = ?'
  ).bind(requesterId).first()

  if (!requester) {
    return c.json({ error: 'リクエストユーザーが見つかりません' }, 404)
  }

  const isAdmin = requester.username === 'admin'
  if (!isAdmin && existing.user_id !== requesterId) {
    return c.json({ error: '権限がありません' }, 403)
  }

  await c.env.DB.prepare(
    'DELETE FROM member_projects WHERE id = ?'
  ).bind(memberProjectId).run()

  return c.json({ success: true })
})

// フォルダー名変更
app.put('/api/folders/:id/rename', async (c) => {
  const folderId = c.req.param('id')
  const { newName, userId, subprojectId } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  if (!newName || !userId || !subprojectId) {
    return c.json({ error: 'newName, userId, subprojectIdが必要です' }, 400)
  }

  // 無効な文字のチェック
  if (newName.includes('/') || newName.includes('\\')) {
    return c.json({ error: 'フォルダー名に / や \\ は使用できません' }, 400)
  }

  // フォルダー情報を取得
  const folder = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ? AND file_type = ?'
  ).bind(folderId, 'folder').first()

  if (!folder) {
    return c.json({ error: 'フォルダーが見つかりません' }, 404)
  }

  const oldName = folder.name as string
  const oldPath = folder.path as string
  const oldFullPath = oldPath === '/' ? `/${oldName}` : `${oldPath}/${oldName}`

  // 新しいフルパスを生成
  const newFullPath = oldPath === '/' ? `/${newName}` : `${oldPath}/${newName}`

  try {
    // 1. フォルダー自体の名前を更新
    await c.env.DB.prepare(
      'UPDATE files SET name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(newName, userId, folderId).run()

    // 2. このフォルダー内のすべてのファイルとサブフォルダーのパスを更新
    // まず、影響を受けるすべてのファイル/フォルダーを取得
    const affectedFiles = await c.env.DB.prepare(
      'SELECT id, path, name FROM files WHERE subproject_id = ? AND (path = ? OR path LIKE ?)'
    ).bind(
      subprojectId,
      oldFullPath,
      `${oldFullPath}/%`
    ).all()

    // 各ファイル/フォルダーのパスを更新
    for (const file of affectedFiles.results) {
      const currentPath = file.path as string
      let newPath: string

      if (currentPath === oldFullPath) {
        // このフォルダー直下のファイル
        newPath = newFullPath
      } else if (currentPath.startsWith(`${oldFullPath}/`)) {
        // サブフォルダー内のファイル
        newPath = currentPath.replace(oldFullPath, newFullPath)
      } else {
        continue
      }

      await c.env.DB.prepare(
        'UPDATE files SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(newPath, file.id).run()
    }

    // タイムラインに記録
    const subproject = await c.env.DB.prepare(
      'SELECT project_id FROM subprojects WHERE id = ?'
    ).bind(subprojectId).first()

    if (subproject) {
      const projectId = subproject.project_id as string
      await c.env.DB.prepare(
        'INSERT INTO timeline (project_id, user_id, file_id, action, description) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        projectId,
        userId,
        folderId,
        'renamed',
        `フォルダー "${oldName}" を "${newName}" に変更しました`
      ).run()
    }

    return c.json({
      success: true,
      message: `フォルダー名を変更しました（${affectedFiles.results.length}個のアイテムのパスを更新）`
    })
  } catch (error) {
    console.error('フォルダー名変更エラー:', error)
    return c.json({ error: 'フォルダー名の変更に失敗しました' }, 500)
  }
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
  if (userId === adminUserId) {
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

  const guard = denyGuest(c, requestUserId)
  if (guard) return guard

  // 自分自身のパスワードのみ変更可能
  if (userId !== requestUserId) {
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

// ==================== ファイル共有 API ====================

// 共有リンク作成
app.post('/api/files/:id/share', async (c) => {
  const fileId = c.req.param('id')
  const { userId, isUnlimited, maxDownloads, unlimitedExpiry } = await c.req.json()

  const guard = denyGuest(c, userId)
  if (guard) return guard

  // ファイルの存在確認
  const file = await c.env.DB.prepare(
    'SELECT * FROM files WHERE id = ? AND file_type = ?'
  ).bind(fileId, 'file').first()

  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  const requester = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!requester) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }

  const isAdmin = requester.username === 'admin'
  if (unlimitedExpiry === true && !isAdmin) {
    return c.json({ error: '無期限リンクの作成権限がありません' }, 403)
  }

  const expiresAt = (() => {
    if (unlimitedExpiry === true) return null
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    return date.toISOString()
  })()

  const hasLimitInput = maxDownloads !== undefined || isUnlimited !== undefined

  const parsedMaxDownloads = (() => {
    if (maxDownloads === null) return null
    if (typeof maxDownloads === 'number') return Math.trunc(maxDownloads)
    if (typeof maxDownloads === 'string' && maxDownloads.trim() !== '') {
      return parseInt(maxDownloads, 10)
    }
    return undefined
  })()

  const resolvedMaxDownloads = (() => {
    if (parsedMaxDownloads === null) return null
    if (typeof parsedMaxDownloads === 'number' && !Number.isNaN(parsedMaxDownloads)) {
      return parsedMaxDownloads
    }
    if (isUnlimited === true) return null
    return 5
  })()

  if (resolvedMaxDownloads !== null) {
    if (!Number.isFinite(resolvedMaxDownloads) || resolvedMaxDownloads < 1 || resolvedMaxDownloads > 32) {
      return c.json({ error: 'ダウンロード上限は1〜32、または無制限です' }, 400)
    }
  }

  // 既存の共有リンクがあるか確認
  const existingShare = await c.env.DB.prepare(
    'SELECT * FROM file_shares WHERE file_id = ? AND created_by = ?'
  ).bind(fileId, userId).first()

  if (existingShare) {
    // 既存の設定を更新
    if (hasLimitInput) {
      await c.env.DB.prepare(
        'UPDATE file_shares SET max_downloads = ? WHERE id = ?'
      ).bind(resolvedMaxDownloads, existingShare.id).run()
    }
    await c.env.DB.prepare(
      'UPDATE file_shares SET expires_at = ? WHERE id = ?'
    ).bind(expiresAt, existingShare.id).run()

    return c.json({
      success: true,
      token: existingShare.token,
      shareId: existingShare.id
    })
  }

  // 新しい共有リンクを作成
  const shareId = generateUuid()
  const token = generateUuid() // トークンとしてUUIDを使用

  await c.env.DB.prepare(
    'INSERT INTO file_shares (id, file_id, created_by, token, max_downloads, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(shareId, fileId, userId, token, resolvedMaxDownloads, expiresAt).run()

  return c.json({ success: true, token, shareId })
})

// 共有ファイル情報取得（公開、認証不要）
app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token')

  // 共有リンクの存在確認
  const share = await c.env.DB.prepare(`
    SELECT 
      fs.*, 
      f.name as file_name, 
      f.file_size, 
      f.mime_type,
      f.path as file_path,
      f.subproject_id,
      u.username as creator_name,
      sp.name as subproject_name,
      p.id as project_id,
      p.name as project_name,
      fs.max_downloads,
      (SELECT COUNT(*) FROM share_downloads WHERE share_id = fs.id) as current_downloads
    FROM file_shares fs
    JOIN files f ON fs.file_id = f.id
    JOIN users u ON fs.created_by = u.id
    JOIN subprojects sp ON f.subproject_id = sp.id
    JOIN projects p ON sp.project_id = p.id
    WHERE fs.token = ?
  `).bind(token).first()

  if (!share) {
    return c.json({ error: '共有リンクが見つかりません' }, 404)
  }

  // 有効期限チェック
  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at as string)
    const now = new Date()
    if (now > expiresAt) {
      return c.json({ error: '共有リンクの有効期限が切れています' }, 410)
    }
  }

  // ダウンロード上限チェック
  const maxDownloads = share.max_downloads as number | null
  const currentDownloads = share.current_downloads as number
  const isLimitExceeded = maxDownloads !== null && currentDownloads >= maxDownloads

  return c.json({
    success: true,
    fileName: share.file_name,
    fileSize: share.file_size,
    mimeType: share.mime_type,
    filePath: share.file_path,
    creatorName: share.creator_name,
    projectName: share.project_name,
    subprojectName: share.subproject_name,
    fileId: share.file_id,
    isLimitExceeded,
    maxDownloads,
    currentDownloads
  })
})

// 共有ファイルダウンロード（公開、認証不要）
app.get('/api/share/:token/download', async (c) => {
  const token = c.req.param('token')
  const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const userAgent = c.req.header('User-Agent') || 'unknown'

  // 共有リンクの存在確認と制限チェック
  const share = await c.env.DB.prepare(`
    SELECT 
      fs.*, 
      f.r2_key, 
      f.name as file_name, 
      f.mime_type,
      (SELECT COUNT(*) FROM share_downloads WHERE share_id = fs.id) as current_downloads
    FROM file_shares fs
    JOIN files f ON fs.file_id = f.id
    WHERE fs.token = ?
  `).bind(token).first()

  if (!share) {
    return c.json({ error: '共有リンクが見つかりません' }, 404)
  }

  // 有効期限チェック
  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at as string)
    const now = new Date()
    if (now > expiresAt) {
      return c.json({ error: '共有リンクの有効期限が切れています' }, 410)
    }
  }

  // ダウンロード上限チェック
  const maxDownloads = share.max_downloads as number | null
  const currentDownloads = share.current_downloads as number
  if (maxDownloads !== null && currentDownloads >= maxDownloads) {
    return c.json({ error: 'ダウンロード上限回数に達しました' }, 403)
  }

  // ダウンロード記録を保存
  await c.env.DB.prepare(
    'INSERT INTO share_downloads (share_id, ip_address, user_agent) VALUES (?, ?, ?)'
  ).bind(share.id, ipAddress, userAgent).run()

  const s3Key = share.r2_key as string

  if (!s3Key) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  // S3のPresigned URLを生成
  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
        },
      })

      const command = new GetObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: s3Key,
      })

      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1時間

      return c.json({
        success: true,
        downloadUrl,
        fileName: share.file_name as string,
        mimeType: share.mime_type as string
      })
    } catch (error) {
      console.error('S3 Download URL生成エラー:', error)
      return c.json({ error: 'ダウンロードURLの生成に失敗しました' }, 500)
    }
  }

  return c.json({ error: 'ストレージ設定が見つかりません' }, 500)
})

// 共有ファイルプレビューURL取得（公開、認証不要）
app.get('/api/share/:token/preview', async (c) => {
  const token = c.req.param('token')

  // 共有リンクの存在確認
  const share = await c.env.DB.prepare(`
    SELECT fs.*, f.r2_key, f.name as file_name, f.mime_type
    FROM file_shares fs
    JOIN files f ON fs.file_id = f.id
    WHERE fs.token = ?
  `).bind(token).first()

  if (!share) {
    return c.json({ error: '共有リンクが見つかりません' }, 404)
  }

  // 有効期限チェック
  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at as string)
    const now = new Date()
    if (now > expiresAt) {
      return c.json({ error: '共有リンクの有効期限が切れています' }, 410)
    }
  }

  const s3Key = share.r2_key as string

  if (!s3Key) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  // S3のPresigned URLを生成
  if (c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY && c.env.S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: c.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: c.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY as string,
        },
      })

      const command = new GetObjectCommand({
        Bucket: c.env.S3_BUCKET,
        Key: s3Key,
      })

      const previewUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1時間

      return c.json({
        success: true,
        previewUrl,
        fileName: share.file_name as string,
        mimeType: share.mime_type as string
      })
    } catch (error) {
      console.error('S3 Preview URL生成エラー:', error)
      return c.json({ error: 'プレビューURLの生成に失敗しました' }, 500)
    }
  }

  return c.json({ error: 'ストレージ設定が見つかりません' }, 500)
})

// 管理者用：全共有リンク一覧取得
app.get('/api/admin/shares', async (c) => {
  const userId = c.req.query('userId')

  if (!userId) {
    return c.json({ error: 'ユーザーIDが必要です' }, 400)
  }

  // 管理者チェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者権限が必要です' }, 403)
  }

  // 全共有リンクを取得
  const shares = await c.env.DB.prepare(`
    SELECT 
      fs.id,
      fs.token,
      fs.created_at,
      fs.max_downloads,
      f.name as file_name,
      u.username as creator_name,
      COUNT(sd.id) as download_count
    FROM file_shares fs
    JOIN files f ON fs.file_id = f.id
    JOIN users u ON fs.created_by = u.id
    LEFT JOIN share_downloads sd ON fs.id = sd.share_id
    GROUP BY fs.id, fs.token, fs.created_at, fs.max_downloads, f.name, u.username
    ORDER BY fs.created_at DESC
  `).all()

  return c.json(shares.results)
})

// 管理者用：共有リンク設定更新
app.put('/api/admin/shares/:id', async (c) => {
  const shareId = c.req.param('id')
  const { userId, maxDownloads } = await c.req.json()

  if (!userId) {
    return c.json({ error: 'ユーザーIDが必要です' }, 400)
  }

  // 管理者チェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者権限が必要です' }, 403)
  }

  // 共有リンクを更新
  await c.env.DB.prepare(
    'UPDATE file_shares SET max_downloads = ? WHERE id = ?'
  ).bind(maxDownloads, shareId).run()

  return c.json({ success: true })
})



// 管理者用：共有リンク削除
app.delete('/api/admin/shares/:id', async (c) => {
  const shareId = c.req.param('id')
  const { userId } = await c.req.json()

  if (!userId) {
    return c.json({ error: 'ユーザーIDが必要です' }, 400)
  }

  // 管理者チェック
  const user = await c.env.DB.prepare(
    'SELECT username FROM users WHERE id = ?'
  ).bind(userId).first()

  if (!user || user.username !== 'admin') {
    return c.json({ error: '管理者権限が必要です' }, 403)
  }

  // 共有リンクを削除
  await c.env.DB.prepare(
    'DELETE FROM file_shares WHERE id = ?'
  ).bind(shareId).run()

  return c.json({ success: true })
})

// ==================== ルートページ ====================

// 共有ページ
app.get('/share/:token', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ファイルダウンロード - CoNAGIT</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <style>
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
      </style>
    </head>
    <body class="bg-gray-50">
      <div id="app"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
      <script src="/static/share.js"></script>
    </body>
    </html>
  `)
})

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
