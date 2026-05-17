// src/s3/presign-get-url.ts
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Presigned GET for reading an object (e.g. thumb before Cloudflare transform).
 */
export async function presignGetObjectUrl(params: {
  client: S3Client;
  bucket: string;
  key: string;
  expiresInSec?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });
  const expiresIn = params.expiresInSec ?? 900;
  return getSignedUrl(params.client, cmd, { expiresIn });
}
