# CoNAGIT

## プロジェクト概要
- **名前**: CoNAGIT
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
- **files**: ファイル（subproject_id, name, content, path, file_type, mime_type, file_size, updated_by）
  - file_type: 'file' または 'folder'
  - path: 階層構造のパス（例: '/', '/folder1', '/folder1/folder2'）
- **timeline**: タイムライン（project_id, user_id, file_id, action, description）

### ストレージサービス
- **Cloudflare D1**: SQLiteベースの分散データベース
  - ローカル開発: `.wrangler/state/v3/d1`
  - 本番環境: Cloudflare D1
- **AWS S3**: ファイルストレージ（20MB以上のファイルは直接アップロード）
  - 大きなファイルはPresigned URLを使用してフロントエンドから直接アップロード
  - 後方互換性のため、R2もサポート

### データフロー
1. ユーザーログイン → セッション管理（localStorage）
2. プロジェクト操作 → D1データベース更新
3. ファイル編集 → タイムライン自動記録
4. 進捗率更新 → リアルタイム反映

## 機能一覧

### 現在実装済みの機能
✅ **認証システム**
- ログイン/ログアウト
- 平文パスワード認証（開発用）
- セッション管理（localStorage）

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
- ファイル一覧表示（ユーザー名・更新日付・ファイルサイズ）
- ファイル作成・編集・削除
- ファイルダウンロード
- テキストファイルエディタ
- **ファイルアップロード機能（単一・複数）**
- **フォルダアップロード機能**
- **階層構造管理（フォルダ/ファイル）**
- **パンくずリスト表示**
- **フォルダ作成機能**

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
- 複数ファイルの一括ダウンロード（ZIP）
- ファイルプレビュー（画像・PDF等）
- バイナリファイルの完全対応（現在Base64対応）

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
- `GET /api/subprojects/:id/files?path=/` - ファイル一覧取得（階層構造対応）
- `POST /api/subprojects/:id/files` - ファイル作成（単一）
- `POST /api/subprojects/:id/files/batch` - 複数ファイル一括アップロード
- `POST /api/subprojects/:id/folders` - フォルダ作成
- `PUT /api/files/:id` - ファイル更新
- `DELETE /api/files/:id` - ファイル/フォルダ削除
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
1. **フォルダ作成**: 「フォルダ作成」ボタンでフォルダを作成
2. **ファイルアップロード**: 
   - 「ファイルアップロード」ボタンをクリック
   - 「ファイルを選択」で単一または複数ファイルをアップロード
   - 「フォルダを選択」でフォルダ全体をアップロード（階層構造を維持）
3. **ファイル作成**: 「ファイル作成」ボタンで新規ファイルを作成
4. **ファイル編集**: ファイル名をクリックして内容を編集
5. **ダウンロード**: ダウンロードアイコンでファイルをダウンロード
6. **削除**: ゴミ箱アイコンでファイル/フォルダを削除
7. **フォルダ移動**: フォルダ名をクリックして中に入る
8. **パンくずリスト**: 現在位置を表示し、クリックで上位階層へ移動

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
   - 複数ファイルの一括ダウンロード（ZIP生成）
   - シンタックスハイライト（コードエディタ）
   - ファイルプレビュー（画像・PDF・マークダウン）
   - ファイル移動・コピー機能
   - 大容量ファイルサポート（Cloudflare R2連携）

5. **通知機能**
   - リアルタイム通知
   - メール通知

6. **本番環境へのデプロイ**
   - Cloudflare Pagesへのデプロイ
   - 本番D1データベースの作成
   - カスタムドメインの設定

## AWS S3設定

大きなファイル（20MB以上）はAWS S3に直接アップロードされます。

### 1. AWS S3バケットの作成
1. AWSコンソールでS3バケットを作成
2. バケット名をメモ（例: `webapp-files`）
3. リージョンを選択（推奨: `ap-northeast-1`）

### 2. IAMユーザーの作成と権限設定
1. IAMで新しいユーザーを作成
2. 以下のポリシーをアタッチ：
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```
3. アクセスキーIDとシークレットアクセスキーを取得

### 3. Cloudflare Pages環境変数の設定
Cloudflare Pagesのダッシュボードで以下の環境変数を設定：

- `AWS_ACCESS_KEY_ID`: IAMユーザーのアクセスキーID
- `AWS_SECRET_ACCESS_KEY`: IAMユーザーのシークレットアクセスキー
- `AWS_REGION`: S3バケットのリージョン（例: `ap-northeast-1`）
- `S3_BUCKET`: S3バケット名（例: `webapp-files`）

### 4. ローカル開発環境の設定
`.dev.vars`ファイルを作成（`.gitignore`に追加済み）：
```
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-northeast-1
S3_BUCKET=your-bucket-name
```

## デプロイメント
- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ✅ ローカル開発完了 / ✅ 本番デプロイ済み
- **最終更新**: 2025-12-05

## ライセンス
MIT License
