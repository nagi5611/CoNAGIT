import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { createApp } from "../src/app.js";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://mock-s3.example/presigned-put"),
}));

describe("media API HTTP", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.S3_UPLOAD_BUCKET = "test-bucket";
    process.env.PRESIGN_REQUIRE_AUTH = "0";
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.clearAllMocks();
  });

  it("POST /api/media/presign-pair returns keys and presigned targets", async () => {
    const app = createApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const port = addr.port;
    const uploadId = "11111111-2222-4333-8444-555555555555";
    const res = await fetch(`http://127.0.0.1:${port}/api/media/presign-pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        uploadId,
        videoContentType: "video/mp4",
        thumbContentType: "image/jpeg",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      videoKey: string;
      thumbKey: string;
      video: { url: string };
      thumb: { url: string };
    };
    expect(json.videoKey).toBe(`uploads/raw/${uploadId}/video.bin`);
    expect(json.thumbKey).toBe(`uploads/raw/${uploadId}/thumb.jpg`);
    expect(json.video.url).toContain("mock-s3");
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });
});
