/**
 * S3 object key helpers for the media raw pair (video + client-generated thumb).
 * Keys are normalized to lowercase uploadId (UUID) segments only — validate at API boundary.
 */

const RAW_PREFIX = "uploads/raw";

/** @param uploadId UUID (already validated) */
export function rawVideoKey(uploadId: string): string {
  return `${RAW_PREFIX}/${uploadId}/video.bin`;
}

/** @param uploadId UUID (already validated) */
export function rawThumbKey(uploadId: string): string {
  return `${RAW_PREFIX}/${uploadId}/thumb.jpg`;
}

/** Normalize uploadId: trim + lowercase (call after UUID syntax check). */
export function normalizeUploadId(uploadId: string): string {
  return uploadId.trim().toLowerCase();
}
