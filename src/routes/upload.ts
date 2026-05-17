// src/routes/upload.ts
import { Router, type RequestHandler } from "express";
import type { S3Client } from "@aws-sdk/client-s3";
import { presignPutObjectUrl } from "../s3/sigv4.js";

export type UploadRouterDeps = {
  s3: S3Client;
  bucket: string;
  expiresInSec?: number;
  requireAuth: RequestHandler;
};

type PresignBody = {
  key?: unknown;
  contentType?: unknown;
};

/**
 * POST /api/upload/presign — single-object presigned PUT (generic key path).
 */
export function createUploadRouter(deps: UploadRouterDeps): Router {
  const r = Router();

  r.post("/api/upload/presign", deps.requireAuth, async (req, res, next) => {
    try {
      const body = req.body as PresignBody;
      const key = typeof body.key === "string" ? body.key.trim() : "";
      const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
      if (!key || !contentType) {
        res.status(400).json({ error: "missing_key_or_content_type" });
        return;
      }
      const signed = await presignPutObjectUrl({
        client: deps.s3,
        bucket: deps.bucket,
        key,
        contentType,
        expiresInSec: deps.expiresInSec ?? 900,
      });
      res.json(signed);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
