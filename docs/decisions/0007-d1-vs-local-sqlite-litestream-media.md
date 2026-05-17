# ADR 0007: メディア処理状態はローカル SQLite + Litestream、D1 は既存スコープを維持する

| 項目 | 内容 |
|------|------|
| 状態 | 採択 |
| 日付 | 2026-05-17 |
| 文脈 | [実装計画書-画像メディアパイプライン](../実装計画書-画像メディアパイプライン.md)、マスター計画の D1 利用（`docs/decisions/0001-runtime-cloudflare-worker-d1.md` 想定） |

## コンテキスト

メディアパイプラインでは、S3 オブジェクト単位の **処理状態**（検証中／変換中／R2 書き込み済み等）を保持する DB が必要である。一方、マスター計画では **Cloudflare D1** を Worker 側のデータストアとして用いる前提がある。

ユーザー条件として **Docker を避けたい**、**SQLite 単体は耐障害性が弱い**、**最低限バックアップ可能** である。

## 判断基準

- 自宅／低性能サーバー上の **バックアップ容易性**（継続レプリケーション）。
- **書き込み競合**（キュー複数消費者 vs 単一 DB）の扱い。
- マスター計画の D1 投資との **二重管理の回避**。

## 決定

1. **Cloudflare D1** は、既存 ADR およびマスター計画のスコープ（認証・メタデータ・Worker 近傍データ等）を **変更せず維持**する。  
2. メディアパイプラインの **オブジェクト処理状態**（S3 キー主キー／正規化ルールに従う行）は、**ローカル SQLite + Litestream** を **第一推奨**とする。レプリカ先は **R2 または S3 互換ストレージ**とする。  
3. キュー消費プロセスは原則 **シングルワーカー**（または WAL + 極短トランザクション）とし、SQLite のロック競合を避ける。

**PostgreSQL（コンテナなし OS パッケージ）+ 定期 `pg_dump`** は、リソースに余裕がある場合の代替として計画書に残すが、本 ADR の既定ではない。

## 結果

- メディア処理用 DB のスキーマ・マイグレーションは **Node 側リポジトリ**（例: `migrations/` の別系統または別ファイル命名）で管理する方針とし、D1 マイグレーションと混在させない。  
- 運用は [Litestream Runbook](../runbooks/litestream-backup-restore.md) に従う。

## 出典（公式・準公式）

- Litestream S3 互換（**Cloudflare R2 のエンドポイントパターンが表に記載**）: [litestream.io/guides/s3-compatible](https://litestream.io/guides/s3-compatible/)  
- Cloudflare D1 の位置づけ: 既存 `0001-runtime-cloudflare-worker-d1.md` および [D1 ドキュメント](https://developers.cloudflare.com/d1/)（製品概要の確認用）
