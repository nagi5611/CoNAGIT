// web/src/main.js
import {
  DEFAULT_PRESIGN_PATH,
  fetchPresignPair,
  presignedPut,
  uploadVideoOnlyPoC,
  uploadVideoWithThumbPoC,
} from "./media-upload-poc.js";

const apiBase = import.meta.env?.VITE_API_ORIGIN ?? "";

function log(line) {
  const el = document.getElementById("log");
  if (el) el.textContent += `${line}\n`;
  console.log(line);
}

function handlePickVideo() {
  const input = document.getElementById("video");
  if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
  const f = input.files[0];
  log(`selected: ${f.name} (${f.type}, ${f.size} bytes)`);
}

/**
 * Run presign-only (no S3 PUT) to verify API wiring.
 */
async function handlePresignOnly() {
  const input = document.getElementById("video");
  if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
    log("pick a video first");
    return;
  }
  const videoFile = input.files[0];
  const uploadId = crypto.randomUUID();
  const videoContentType = videoFile.type || "application/octet-stream";
  const thumbContentType = "image/jpeg";
  const json = await fetchPresignPair(apiBase, DEFAULT_PRESIGN_PATH, {
    uploadId,
    videoContentType,
    thumbContentType,
  });
  log(`presign ok uploadId=${uploadId}\n${JSON.stringify(json, null, 2)}`);
}

/**
 * Full flow: thumb (Mediabunny / ffmpeg) + dual PUT.
 */
async function handleUploadFull() {
  const input = document.getElementById("video");
  if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
    log("pick a video first");
    return;
  }
  const videoFile = input.files[0];
  const uploadId = crypto.randomUUID();
  log(`upload start ${uploadId} …`);
  const json = await uploadVideoWithThumbPoC({
    apiBase,
    uploadId,
    videoFile,
  });
  log(`done keys: ${json.videoKey} ${json.thumbKey}`);
}

async function handleUploadVideoOnly() {
  const input = document.getElementById("video");
  if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
    log("pick a video first");
    return;
  }
  const videoFile = input.files[0];
  const uploadId = crypto.randomUUID();
  log(`video-only upload ${uploadId} …`);
  const json = await uploadVideoOnlyPoC({ apiBase, uploadId, videoFile });
  log(`done videoKey=${json.videoKey}`);
}

document.getElementById("btnPick")?.addEventListener("click", handlePickVideo);
document.getElementById("btnPresign")?.addEventListener("click", () => {
  handlePresignOnly().catch((e) => log(String(e)));
});
document.getElementById("btnUpload")?.addEventListener("click", () => {
  handleUploadFull().catch((e) => log(String(e)));
});
document.getElementById("btnVideoOnly")?.addEventListener("click", () => {
  handleUploadVideoOnly().catch((e) => log(String(e)));
});

log(`apiBase=${apiBase || "(same-origin)"} path=${DEFAULT_PRESIGN_PATH}`);
export { fetchPresignPair, presignedPut };
