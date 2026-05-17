// src/media/validate-s3-thumb.ts
import { GetObjectCommand, HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export type ThumbValidationResult = { ok: true } | { ok: false; reason: string };

/** Exported for unit tests (magic sniff only, no S3). */
export function detectImageKindFromMagic(head: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "png";
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/**
 * HEAD + first bytes magic check (JPEG / PNG / WebP). GIF excluded.
 */
export async function validateS3ThumbObject(params: {
  s3: S3Client;
  bucket: string;
  key: string;
  maxBytes: number;
}): Promise<ThumbValidationResult> {
  const headMeta = await params.s3.send(
    new HeadObjectCommand({ Bucket: params.bucket, Key: params.key }),
  );
  const len = headMeta.ContentLength ?? 0;
  if (len <= 0) return { ok: false, reason: "empty_object" };
  if (len > params.maxBytes) return { ok: false, reason: "too_large" };
  const ct = (headMeta.ContentType ?? "").toLowerCase();
  if (!ct.startsWith("image/")) return { ok: false, reason: "bad_content_type" };
  if (ct.includes("gif")) return { ok: false, reason: "gif_not_allowed" };

  const ranged = await params.s3.send(
    new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Range: "bytes=0-31",
    }),
  );
  const body = ranged.Body;
  if (!body) return { ok: false, reason: "no_body" };
  const buf = await body.transformToByteArray();
  const magic = detectImageKindFromMagic(buf);
  if (!magic) return { ok: false, reason: "bad_magic_bytes" };
  return { ok: true };
}
