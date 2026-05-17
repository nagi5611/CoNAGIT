// src/media/presign-mime.ts
/** Allowed video Content-Type values for presign-pair (extend as needed). */
export const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/octet-stream",
]);

/** Allowed thumb Content-Type (GIF excluded per media pipeline plan). */
export const ALLOWED_THUMB_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function assertAllowedVideoContentType(ct: string): void {
  if (!ALLOWED_VIDEO_CONTENT_TYPES.has(ct)) {
    throw Object.assign(new Error("unsupported_video_content_type"), { status: 400 });
  }
}

export function assertAllowedThumbContentType(ct: string): void {
  if (!ALLOWED_THUMB_CONTENT_TYPES.has(ct)) {
    throw Object.assign(new Error("unsupported_thumb_content_type"), { status: 400 });
  }
}
