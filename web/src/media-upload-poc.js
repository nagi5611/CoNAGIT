/**
 * web/src/media-upload-poc.js
 * PoC: Presign pair → S3 dual PUT. Mediabunny thumb capture is optional (dynamic import).
 */

export const DEFAULT_PRESIGN_PATH = "/api/media/presign-pair";

/**
 * POST JSON to API and return parsed presign payload.
 * @param {string} apiBase e.g. import.meta.env.VITE_API_ORIGIN or ""
 * @param {string} path default DEFAULT_PRESIGN_PATH
 * @param {{ uploadId: string, videoContentType: string, thumbContentType: string }} body
 * @param {RequestInit} [init] extra fetch options (credentials, headers)
 */
export async function fetchPresignPair(apiBase, path, body, init = {}) {
  const url = `${apiBase.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    credentials: init.credentials ?? "include",
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`presign failed: ${res.status} ${t}`);
  }
  return await res.json();
}

/**
 * PUT a Blob or File to a presigned URL.
 * @param {{ url: string, headers?: Record<string, string> }} target
 * @param {Blob} blob
 */
export async function presignedPut(target, blob) {
  const headers = new Headers(target.headers || {});
  if (!headers.has("content-type") && blob.type) headers.set("content-type", blob.type);
  const res = await fetch(target.url, { method: "PUT", headers, body: blob });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed: ${res.status} ${t}`);
  }
}

/**
 * Try Mediabunny to extract a near-first-frame JPEG blob.
 * API follows official Quick start (Input + BlobSource + CanvasSink + getFirstTimestamp).
 * @see https://mediabunny.dev/guide/quick-start#extract-video-thumbnails
 * @param {File} videoFile
 * @returns {Promise<Blob | null>}
 */
export async function tryMediabunnyThumbJpeg(videoFile) {
  try {
    const mb = await import("mediabunny");
    const { Input, ALL_FORMATS, BlobSource, CanvasSink } = mb;
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoFile) });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return null;
    if (!(await videoTrack.canDecode())) return null;
    const sink = new CanvasSink(videoTrack, { width: 320 });
    const startTs = await videoTrack.getFirstTimestamp();
    const { canvas } = await sink.getCanvas(startTs);
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
      return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    }
    const blob = await new Promise((resolve, reject) => {
      if (!canvas || !("toBlob" in canvas)) {
        reject(new Error("canvas toBlob unsupported"));
        return;
      }
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92);
    });
    return blob;
  } catch {
    return null;
  }
}

/**
 * Optional ffmpeg.wasm first-frame JPEG. Returns null if packages missing or on error.
 * Add deps: `@ffmpeg/ffmpeg`, `@ffmpeg/util` (see docs/handoffs/web-ffmpeg-wasm-thumb.md).
 * @param {File} videoFile
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<Blob | null>}
 */
export async function tryFfmpegWasmThumbJpeg(videoFile, opts = {}) {
  const maxBytes = opts.maxBytes ?? 80 * 1024 * 1024;
  if (videoFile.size > maxBytes) return null;
  try {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { fetchFile } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    const inputName = "input.bin";
    const outName = "out.jpg";
    await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
    await ffmpeg.exec(["-i", inputName, "-frames:v", "1", "-q:v", "4", outName]);
    const data = await ffmpeg.readFile(outName);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});
    if (typeof data === "string") return null;
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    return new Blob([u8], { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/**
 * Generic single-key presign (uses API `POST /api/upload/presign`).
 */
export async function fetchUploadPresign(apiBase, key, contentType, init = {}) {
  const url = `${String(apiBase).replace(/\/$/, "")}/api/upload/presign`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    credentials: init.credentials ?? "include",
    body: JSON.stringify({ key, contentType }),
    ...init,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`upload presign failed: ${res.status} ${t}`);
  }
  return await res.json();
}

/** Same key layout as server `rawVideoKey`. */
export function rawVideoKeyForUploadId(uploadId) {
  return `uploads/raw/${uploadId}/video.bin`;
}

/**
 * Single-object presign + PUT (video raw only). Plan §5「動画のみ許可」経路.
 */
export async function uploadVideoOnlyPoC(opts) {
  const key = rawVideoKeyForUploadId(opts.uploadId);
  const contentType = opts.videoFile.type || "application/octet-stream";
  const signed = await fetchUploadPresign(opts.apiBase, key, contentType);
  await presignedPut(signed, opts.videoFile);
  return { ...signed, videoKey: key, uploadId: opts.uploadId };
}

/**
 * End-to-end: presign → optional thumb → PUT video then PUT thumb.
 * Response shape expected from API (adjust when backend is wired):
 * { video: { url, headers? }, thumb: { url, headers? } }
 * @param {object} opts
 * @param {string} opts.apiBase
 * @param {string} [opts.presignPath]
 * @param {string} opts.uploadId
 * @param {File} opts.videoFile
 * @param {File} [opts.thumbFile] if omitted, tries Mediabunny then ffmpeg; if `allowVideoOnly`, falls back to video-only PUT
 */
export async function uploadVideoWithThumbPoC(opts) {
  const presignPath = opts.presignPath ?? DEFAULT_PRESIGN_PATH;
  const videoContentType = opts.videoFile.type || "application/octet-stream";
  let thumbBlob = null;
  if (opts.thumbFile) thumbBlob = opts.thumbFile;
  else {
    thumbBlob = await tryMediabunnyThumbJpeg(opts.videoFile);
    if (!thumbBlob) thumbBlob = await tryFfmpegWasmThumbJpeg(opts.videoFile);
  }
  if (!thumbBlob) {
    if (opts.allowVideoOnly) {
      return uploadVideoOnlyPoC({
        apiBase: opts.apiBase,
        uploadId: opts.uploadId,
        videoFile: opts.videoFile,
      });
    }
    throw new Error("thumb required (file or Mediabunny/ffmpeg), or pass allowVideoOnly");
  }
  const thumbContentType = thumbBlob.type || "image/jpeg";
  const json = await fetchPresignPair(opts.apiBase, presignPath, {
    uploadId: opts.uploadId,
    videoContentType,
    thumbContentType,
  });
  await presignedPut(json.video, opts.videoFile);
  await presignedPut(json.thumb, thumbBlob);
  return json;
}
