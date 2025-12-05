# Team Project Manager

## プロジェクト概要
- **名前**: Team Project Manager
- **目標**: チームのためのプロジェクト管理ツール（GitHub風のインターフェース）
- **特徴**: 
  - ログイン認証システム
  - プロジェクト管理（作成・削除・メンバー管理）
  - 子プロジェクト管理
  - ファイル管理（追加・編集・削除・ダウンロード）
  - リアルタイムタイムライン（編集履歴）
  - シンプル・モダンなUI（白・オレンジ・黒）

## 開発サーバーURL
- **ローカル開発**: https://3000-iham1m0h3a65jaqp4trbd-b32ec7bb.sandbox.novita.ai
- **GitHub**: (未設定)

## データアーキテクチャ

### データモデル
- **users**: ユーザーアカウント（username, password, email）
- **projects**: プロジェクト（name, description, progress, created_by）
- **project_members**: プロジェクトメンバー（project_id, user_id, role）
- **subprojects**: 子プロジェクト（project_id, name, description）
- **files**: ファイル（subproject_id, name, content, updated_by）
- **timeline**: タイムライン（project_id, user_id, file_id, action, description）

### ストレージサービス
- **Cloudflare D1**: SQLiteベースの分散データベース
  - ローカル開発: `.wrangler/state/v3/d1`
  - 本番環境: Cloudflare D1 (未デプロイ)

### データフロー
1. ユーザーログイン → セッション管理（localStorage）
2. プロジェクト操作 → D1データベース更新
3. ファイル編集 → タイムライン自動記録
4. 進捗率更新 → リアルタイム反映

## 機能一覧

### 現在実装済みの機能
✅ **認証システム**
- ログイン/ログアウト
- パスワードハッシュ化（bcryptjs）
- セッション管理

✅ **プロジェクト管理**
- プロジェクト一覧表示
- プロジェクト作成・削除
- プロジェクト詳細表示
- 進捗率表示

✅ **メンバー管理**
- メンバー一覧表示
- メンバー追加・削除（API実装済み）

✅ **子プロジェクト管理**
- 子プロジェクト一覧表示
- 子プロジェクト作成・削除
- ダウンロード機能

✅ **ファイル管理**
- ファイル一覧表示（ユーザー名・更新日付）
- ファイル作成・編集・削除
- ファイルダウンロード
- テキストファイルエディタ

✅ **タイムライン**
- 編集履歴表示（誰が・いつ・何を）
- アクション種別（作成・更新・削除）
- リアルタイム更新

### 未実装の機能
❌ **メンバー管理UI**
- フロントエンドでのメンバー追加・削除UI

❌ **プロジェクト設定**
- プロジェクト進捗率の手動更新
- プロジェクト情報の編集

❌ **ファイル機能拡張**
- バイナリファイルのサポート
- 複数ファイルの一括ダウンロード（ZIP）
- ファイルプレビュー

❌ **検索機能**
- プロジェクト検索
- ファイル検索
- ユーザー検索（API実装済み）

## API エンドポイント

### 認証
- `POST /api/login` - ログイン
- `POST /api/register` - ユーザー登録

### プロジェクト
- `GET /api/projects?userId=X` - プロジェクト一覧取得
- `POST /api/projects` - プロジェクト作成
- `GET /api/projects/:id` - プロジェクト詳細取得
- `PUT /api/projects/:id` - プロジェクト更新
- `DELETE /api/projects/:id` - プロジェクト削除

### メンバー
- `GET /api/projects/:id/members` - メンバー一覧取得
- `POST /api/projects/:id/members` - メンバー追加
- `DELETE /api/projects/:projectId/members/:userId` - メンバー削除

### 子プロジェクト
- `GET /api/projects/:id/subprojects` - 子プロジェクト一覧取得
- `POST /api/projects/:id/subprojects` - 子プロジェクト作成
- `DELETE /api/subprojects/:id` - 子プロジェクト削除

### ファイル
- `GET /api/subprojects/:id/files` - ファイル一覧取得
- `POST /api/subprojects/:id/files` - ファイル作成
- `PUT /api/files/:id` - ファイル更新
- `DELETE /api/files/:id` - ファイル削除
- `GET /api/files/:id/download` - ファイルダウンロード

### タイムライン
- `GET /api/projects/:id/timeline` - タイムライン取得

### ユーザー
- `GET /api/users/search?q=query` - ユーザー検索

## 使い方

### 1. ログイン
- ユーザー名: `admin`
- パスワード: `password123`

他のテストアカウント: `user1` / `password123`, `user2` / `password123`

### 2. プロジェクト管理
1. プロジェクト一覧画面で「新規プロジェクト」をクリック
2. プロジェクト名と説明を入力して作成
3. プロジェクトカードをクリックして詳細画面へ

### 3. 子プロジェクト管理
1. プロジェクト詳細画面で「追加」をクリック
2. 子プロジェクト名と説明を入力して作成
3. 子プロジェクトをクリックしてファイル管理画面へ
4. ダウンロードボタンでファイルをダウンロード

### 4. ファイル管理
1. 子プロジェクト画面で「ファイル追加」をクリック
2. ファイル名と内容を入力して作成
3. ファイルをクリックして編集
4. ダウンロードアイコンでダウンロード
5. ゴミ箱アイコンで削除

### 5. タイムライン
- プロジェクト詳細画面の右側に自動表示
- ファイルの作成・更新・削除が記録される
- 誰が・いつ・何をしたかが一目でわかる

## 開発情報

### 技術スタック
- **フレームワーク**: Hono (Cloudflare Workers)
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JavaScript + TailwindCSS
- **認証**: bcryptjs
- **デプロイ**: Cloudflare Pages (未デプロイ)

### ローカル開発

```bash
# データベースマイグレーション
npm run db:migrate:local

# テストデータ投入
npm run db:seed

# ビルド
npm run build

# 開発サーバー起動
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs --nostream

# サービス停止
pm2 delete webapp
```

### データベース操作

```bash
# ローカルデータベースのリセット
npm run db:reset

# SQLクエリ実行
npx wrangler d1 execute webapp-production --local --command="SELECT * FROM users"
```

## 推奨される次のステップ

1. **メンバー管理UIの実装**
   - プロジェクト設定画面を追加
   - メンバー追加・削除機能のUI実装

2. **プロジェクト設定機能**
   - プロジェクト情報編集
   - 進捗率の手動更新

3. **検索機能の追加**
   - プロジェクト検索バー
   - ファイル内容検索

4. **ファイル機能の拡張**
   - バイナリファイルのアップロード（Cloudflare R2連携）
   - 複数ファイルの一括ダウンロード（ZIP生成）
   - シンタックスハイライト

5. **通知機能**
   - リアルタイム通知
   - メール通知

6. **本番環境へのデプロイ**
   - Cloudflare Pagesへのデプロイ
   - 本番D1データベースの作成
   - カスタムドメインの設定

## デプロイメント
- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ✅ ローカル開発完了 / ❌ 本番未デプロイ
- **最終更新**: 2025-12-05

## ライセンス
MIT License
