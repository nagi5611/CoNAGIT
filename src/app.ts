// src/app.ts
import express, { type Express } from "express";
import { S3Client } from "@aws-sdk/client-s3";
import { createMediaPresignPairRouter } from "./routes/media-presign-pair.js";
import { createUploadRouter } from "./routes/upload.js";
import { requireAuthSession } from "./auth/session.js";
import { requiredEnv } from "./env.js";
import { MediaPipelineDb } from "./media/media-pipeline-db.js";

/**
 * Build Express app with media presign-pair + generic upload presign.
 */
export function createApp(): Express {
  const app = express();

  app.use((req, res, next) => {
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const s3 = new S3Client({ region: requiredEnv("AWS_REGION") });
  const bucket = requiredEnv("S3_UPLOAD_BUCKET");
  const expiresInSec = Number(process.env.PRESIGN_EXPIRES_SEC ?? "900") || 900;

  let mediaPipelineDb: MediaPipelineDb | undefined;
  const dbPath = process.env.MEDIA_PIPELINE_DB_PATH?.trim();
  if (dbPath) {
    mediaPipelineDb = new MediaPipelineDb(dbPath);
    mediaPipelineDb.migrate();
  }

  app.use(
    createMediaPresignPairRouter({
      s3,
      bucket,
      expiresInSec,
      requireAuth: requireAuthSession,
      mediaPipelineDb,
    }),
  );

  app.use(
    createUploadRouter({
      s3,
      bucket,
      expiresInSec,
      requireAuth: requireAuthSession,
    }),
  );

  return app;
}
