// src/jobs/media-pipeline-sqs-worker.ts
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requiredEnv } from "../env.js";
import { presignGetObjectUrl } from "../s3/sigv4.js";
import { deleteS3Object } from "../s3/delete-object.js";
import { MediaPipelineDb } from "../media/media-pipeline-db.js";
import { validateS3ThumbObject } from "../media/validate-s3-thumb.js";

export type S3ObjectRef = { bucket: string; key: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Parse SNS-wrapped or raw S3 event JSON and return object refs.
 */
export function parseS3RecordsFromMessage(body: string): S3ObjectRef[] {
  const out: S3ObjectRef[] = [];
  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.Records)) {
      for (const rec of o.Records as Record<string, unknown>[]) {
        const s3 = rec?.s3 as Record<string, unknown> | undefined;
        if (!s3) continue;
        const b = s3.bucket as Record<string, unknown> | undefined;
        const ob = s3.object as Record<string, unknown> | undefined;
        if (b?.name && ob?.key) {
          const key = decodeURIComponent(String(ob.key).replace(/\+/g, " "));
          out.push({ bucket: String(b.name), key });
        }
      }
    }
    if (typeof o.Message === "string") {
      try {
        walk(JSON.parse(o.Message));
      } catch {
        /* ignore */
      }
    }
  };
  try {
    walk(JSON.parse(body));
  } catch {
    /* ignore */
  }
  return out;
}

/** Extract UUID from `uploads/raw/<uuid>/thumb.jpg`. */
export function uploadIdFromThumbKey(key: string): string | null {
  const m = /^uploads\/raw\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/thumb\.jpg$/i.exec(
    key,
  );
  return m ? m[1].toLowerCase() : null;
}

async function fetchTransformedWebp(params: {
  transformsUrlTemplate: string;
  presignedGetUrl: string;
  maxRetries: number;
}): Promise<Uint8Array> {
  const transformUrl = params.transformsUrlTemplate.replace(
    "{source}",
    encodeURIComponent(params.presignedGetUrl),
  );
  let lastStatus = 0;
  for (let attempt = 0; attempt < params.maxRetries; attempt++) {
    const imgRes = await fetch(transformUrl);
    lastStatus = imgRes.status;
    if (imgRes.ok) {
      return new Uint8Array(await imgRes.arrayBuffer());
    }
    if (imgRes.status >= 500 && attempt < params.maxRetries - 1) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    break;
  }
  throw new Error(`cf_transform_failed:${lastStatus}`);
}

/**
 * Process one thumb: DB states → validate S3 → CF transform → R2 PUT.
 * Validation failure: delete S3 object, mark `failed`, return (caller ACKs SQS).
 * CF failure after retries: mark `failed`, return.
 */
export async function processThumbRecord(params: {
  bucket: string;
  key: string;
  s3: S3Client;
  sourceBucket: string;
  transformsUrlTemplate: string;
  r2: S3Client;
  r2Bucket: string;
  mediaDb?: MediaPipelineDb | null;
  thumbMaxBytes: number;
  cfMaxRetries: number;
  r2CacheControl?: string;
}): Promise<void> {
  const { bucket, key, s3, sourceBucket, transformsUrlTemplate, r2, r2Bucket, mediaDb } = params;
  if (bucket !== sourceBucket) return;
  if (!key.endsWith("/thumb.jpg")) return;
  const uploadId = uploadIdFromThumbKey(key);
  if (!uploadId) return;

  const track = mediaDb?.hasRow(key) ?? false;
  if (track) {
    mediaDb!.setState(key, "received");
    mediaDb!.setState(key, "validating");
  }

  const validation = await validateS3ThumbObject({
    s3,
    bucket,
    key,
    maxBytes: params.thumbMaxBytes,
  });
  if (!validation.ok) {
    try {
      await deleteS3Object({ client: s3, bucket, key });
    } catch {
      /* best-effort delete per plan */
    }
    if (track) mediaDb!.markFailed(key, "validation", validation.reason);
    return;
  }

  if (track) mediaDb!.setState(key, "transforming");

  const getUrl = await presignGetObjectUrl({
    client: s3,
    bucket,
    key,
    expiresInSec: 600,
  });

  let webp: Uint8Array;
  try {
    webp = await fetchTransformedWebp({
      transformsUrlTemplate,
      presignedGetUrl: getUrl,
      maxRetries: params.cfMaxRetries,
    });
  } catch (e) {
    if (track) mediaDb!.markFailed(key, "cf_transform", String(e));
    return;
  }

  const r2Key = `optimized/${uploadId}/thumb.webp`;
  await r2.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: r2Key,
      Body: Buffer.from(webp),
      ContentType: "image/webp",
      CacheControl: params.r2CacheControl ?? "public, max-age=86400",
    }),
  );
  mediaDb?.markR2Written(key, r2Key);
}

/**
 * Parse SQS body and process each matching thumb record.
 */
export async function processMediaPipelineMessage(params: {
  body: string;
  s3: S3Client;
  sourceBucket: string;
  transformsUrlTemplate: string;
  r2: S3Client;
  r2Bucket: string;
  mediaDb?: MediaPipelineDb | null;
  thumbMaxBytes?: number;
  cfMaxRetries?: number;
  r2CacheControl?: string;
}): Promise<void> {
  const thumbMaxBytes =
    params.thumbMaxBytes ??
    (() => {
      const n = Number(process.env.MEDIA_THUMB_MAX_BYTES);
      return Number.isFinite(n) && n > 0 ? n : 25 * 1024 * 1024;
    })();
  const cfMaxRetries =
    params.cfMaxRetries ??
    (() => {
      const n = Number(process.env.MEDIA_CF_MAX_RETRIES);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
    })();
  const records = parseS3RecordsFromMessage(params.body);
  for (const ref of records) {
    await processThumbRecord({
      ...ref,
      s3: params.s3,
      sourceBucket: params.sourceBucket,
      transformsUrlTemplate: params.transformsUrlTemplate,
      r2: params.r2,
      r2Bucket: params.r2Bucket,
      mediaDb: params.mediaDb,
      thumbMaxBytes,
      cfMaxRetries,
      r2CacheControl: params.r2CacheControl ?? process.env.MEDIA_R2_CACHE_CONTROL,
    });
  }
}

/**
 * Long-poll SQS until aborted. Requires full env (see `.env.example`).
 */
export async function runMediaPipelineSqsWorkerLoop(signal: AbortSignal): Promise<void> {
  const queueUrl = requiredEnv("MEDIA_PIPELINE_SQS_QUEUE_URL");
  const region = requiredEnv("AWS_REGION");
  const sourceBucket = requiredEnv("S3_UPLOAD_BUCKET");
  const transformsTemplate = requiredEnv("MEDIA_CF_TRANSFORMS_URL_TEMPLATE");
  const r2Endpoint = requiredEnv("R2_ENDPOINT");
  const r2Bucket = requiredEnv("R2_BUCKET");
  const r2Access = requiredEnv("R2_ACCESS_KEY_ID");
  const r2Secret = requiredEnv("R2_SECRET_ACCESS_KEY");

  const sqs = new SQSClient({ region });
  const s3 = new S3Client({ region });
  const r2 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: { accessKeyId: r2Access, secretAccessKey: r2Secret },
  });

  let mediaDb: MediaPipelineDb | undefined;
  const dbPath = process.env.MEDIA_PIPELINE_DB_PATH?.trim();
  if (dbPath) {
    mediaDb = new MediaPipelineDb(dbPath);
    mediaDb.migrate();
  }

  try {
    while (!signal.aborted) {
      const out = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 120,
        }),
      );
      const messages = out.Messages ?? [];
      if (messages.length === 0) continue;
      for (const msg of messages) {
        if (!msg.Body || !msg.ReceiptHandle) continue;
        try {
          await processMediaPipelineMessage({
            body: msg.Body,
            s3,
            sourceBucket,
            transformsUrlTemplate: transformsTemplate,
            r2,
            r2Bucket,
            mediaDb,
          });
        } catch (e) {
          console.error("media pipeline message failed", e);
          throw e;
        }
        await sqs.send(
          new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }),
        );
      }
    }
  } finally {
    mediaDb?.close();
  }
}
