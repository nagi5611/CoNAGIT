# 手当て: `media-presign-pair` を `app.ts` に載せる

## 1. 依存（ルート `package.json`）

`docs/handoffs/package-deps-media-presign.json` を参照し、既存の `dependencies` に **マージ**（上書き全置換は禁止）。

## 2. ルート登録例（Express）

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { createMediaPresignPairRouter } from "./routes/media-presign-pair.js";
// 既存の認証ミドルウェア名に置き換え（例: requireAdminSession 等）
import { requireAuthSession } from "./auth/session.js";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

app.use(
  createMediaPresignPairRouter({
    s3: s3Client,
    bucket: process.env.S3_UPLOAD_BUCKET!, // 実プロジェクトのバケット環境変数名に合わせる
    expiresInSec: 900,
    requireAuth: requireAuthSession,
  }),
);
```

- **パス**: `POST /api/media/presign-pair`（`createMediaPresignPairRouter` 内で固定）。
- **JSON**: `{ "uploadId": "<uuid>", "videoContentType": "video/mp4", "thumbContentType": "image/jpeg" }`
- **レスポンス**: `{ "video": { "url", "headers" }, "thumb": { ... }, "videoKey", "thumbKey", "uploadId" }`

## 3. 既存 `upload.ts` との関係

- 既存の単体プリサインがある場合、**S3 クライアントとバケット**は共有でよい。
- 認可レベル（誰が presign-pair を叩けるか）は **`requireAuth` の選択**で既存アップロード API と揃える。
