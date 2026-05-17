// src/routes/media-presign-pair.ts
import { Router, type RequestHandler } from "express";
import type { S3Client } from "@aws-sdk/client-s3";
import { normalizeUploadId, rawThumbKey, rawVideoKey } from "../media/s3-raw-keys.js";
import {
  assertAllowedThumbContentType,
  assertAllowedVideoContentType,
} from "../media/presign-mime.js";
import { presignPutObjectUrl } from "../s3/sigv4.js";

import type { MediaPipelineDb } from "../media/media-pipeline-db.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MediaPresignPairDeps = {
  s3: S3Client;
  bucket: string;
  /** Passed through to getSignedUrl expiresIn (seconds). */
  expiresInSec?: number;
  /** Session / CSRF / role guard — mount order: before this router's POST. */
  requireAuth: RequestHandler;
  /** When set, presign-pair upserts a row in local SQLite. */
  mediaPipelineDb?: MediaPipelineDb | null;
};

type PresignBody = {
  uploadId?: unknown;
  videoContentType?: unknown;
  thumbContentType?: unknown;
};

/**
 * POST /api/media/presign-pair — returns two presigned PUT URLs (raw video + raw thumb JPEG key path).
 */
export function createMediaPresignPairRouter(deps: MediaPresignPairDeps): Router {
  const r = Router();

  r.post("/api/media/presign-pair", deps.requireAuth, async (req, res, next) => {
    try {
      const body = req.body as PresignBody;
      const uploadIdRaw = typeof body.uploadId === "string" ? body.uploadId : "";
      const uploadId = normalizeUploadId(uploadIdRaw);
      if (!UUID_RE.test(uploadId)) {
        res.status(400).json({ error: "invalid_upload_id" });
        return;
      }
      const videoContentType =
        typeof body.videoContentType === "string" ? body.videoContentType.trim() : "";
      const thumbContentType =
        typeof body.thumbContentType === "string" ? body.thumbContentType.trim() : "";
      if (!videoContentType || !thumbContentType) {
        res.status(400).json({ error: "missing_content_type" });
        return;
      }
      assertAllowedVideoContentType(videoContentType);
      assertAllowedThumbContentType(thumbContentType);

      const videoKey = rawVideoKey(uploadId);
      const thumbKey = rawThumbKey(uploadId);
      const expiresInSec = deps.expiresInSec ?? 900;

      const [video, thumb] = await Promise.all([
        presignPutObjectUrl({
          client: deps.s3,
          bucket: deps.bucket,
          key: videoKey,
          contentType: videoContentType,
          expiresInSec,
        }),
        presignPutObjectUrl({
          client: deps.s3,
          bucket: deps.bucket,
          key: thumbKey,
          contentType: thumbContentType,
          expiresInSec,
        }),
      ]);

      if (deps.mediaPipelineDb) {
        deps.mediaPipelineDb.recordPresignPair({
          uploadId,
          videoKey,
          thumbKey,
          videoContentType,
          thumbContentType,
        });
      }

      res.json({ video, thumb, videoKey, thumbKey, uploadId });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err && err.status === 400) {
        res.status(400).json({ error: err.message ?? "bad_request" });
        return;
      }
      next(e);
    }
  });

  return r;
}
