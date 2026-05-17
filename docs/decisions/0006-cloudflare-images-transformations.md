# ADR 0006: メディアパイプラインの Cloudflare 画像変換は Images / Transformations を用いる

| 項目 | 内容 |
|------|------|
| 状態 | 採択 |
| 日付 | 2026-05-17 |
| 文脈 | [実装計画書-画像メディアパイプライン](../実装計画書-画像メディアパイプライン.md) |

## コンテキスト

サムネイル等の静止画を Cloudflare 側でリサイズ・最適化し、**変換後のバイト列を取得して R2 の公開バケット**に保存する。候補として (A) **Cloudflare Images** の **Transformations（リモート画像／Bring your own storage）**、(B) **Images のホスト型（直接アップロード）**、(C) 自前の画像デコード（Worker 内 wasm 等）が考えられる。

## 判断基準

- **R2 へ自前 PUT** する運用との相性（最適化済みオブジェクトを決められたキーで保持できるか）。
- **課金の透明性**（ユニーク変換・リクエスト等の公式定義が追いやすいか）。最新の単価・無料枠は **公式 Pricing** を正とする。
- **既存コードとの整合**（`src/thumbnail/cf-images-probe.ts` 等のプローブ・検証を発展させやすいか）。

## 決定

**Cloudflare Images の Transformations（リモート画像を最適化する経路）**を、本パイプラインの **エッジ画像変換の主手段**とする。ゾーン上の URL 形式、または Workers 経由で変換を要求し、プロセッサは **変換結果のバイト列**を取得して R2 に `PutObject` する。

**ホスト型 Images（アップロード先を Cloudflare Images に置く案）**は、本プロジェクトの「S3 に raw を置き、最適化版は R2 公開」の二段ストレージモデルと **重複・運用分散** になりやすいため **採用しない**（別プロダクトでホスト型のみに統一する場合は再 ADR）。

## 結果

- プロセッサ実装は **Images のドキュメント（Transformations / sources / Workers 連携）**に沿って進める。
- **料金・上限**はリリース前に [Pricing](https://developers.cloudflare.com/images/pricing/) および [features / limits](https://developers.cloudflare.com/images/optimization/features/) を再確認し、コスト見積りに反映する。

## 出典（公式）

- [Cloudflare Images（製品概要）](https://developers.cloudflare.com/images/)
- [Transformations / remote images（概要）](https://developers.cloudflare.com/images/optimization/transformations/overview/)
- [Pricing](https://developers.cloudflare.com/images/pricing/)
