import { describe, expect, it } from "vitest";
import { MediaPipelineDb } from "../src/media/media-pipeline-db.js";

describe("MediaPipelineDb", () => {
  it("migrates and records presign pair", () => {
    const db = new MediaPipelineDb(":memory:");
    db.migrate();
    db.recordPresignPair({
      uploadId: "11111111-2222-4333-8444-555555555555",
      videoKey: "uploads/raw/11111111-2222-4333-8444-555555555555/video.bin",
      thumbKey: "uploads/raw/11111111-2222-4333-8444-555555555555/thumb.jpg",
      videoContentType: "video/mp4",
      thumbContentType: "image/jpeg",
    });
    db.markR2Written(
      "uploads/raw/11111111-2222-4333-8444-555555555555/thumb.jpg",
      "optimized/11111111-2222-4333-8444-555555555555/thumb.webp",
    );
    expect(db.getState("uploads/raw/11111111-2222-4333-8444-555555555555/thumb.jpg")).toBe("r2_written");
    db.close();
  });
});
