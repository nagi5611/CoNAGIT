// src/s3/presign-put-url.ts
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PresignedPut = {
  url: string;
  /** Headers the browser must send on PUT (S3 may require Content-Type match). */
  headers: Record<string, string>;
};

/**
 * Build a SigV4 presigned URL for a single PUT of an object with fixed Content-Type.
 */
export async function presignPutObjectUrl(params: {
  client: S3Client;
  bucket: string;
  key: string;
  contentType: string;
  /** Default 900 (15m). */
  expiresInSec?: number;
}): Promise<PresignedPut> {
  const cmd = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });
  const expiresIn = params.expiresInSec ?? 900;
  const url = await getSignedUrl(params.client, cmd, { expiresIn });
  return { url, headers: { "content-type": params.contentType } };
}
