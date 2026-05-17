import { describe, expect, it } from "vitest";
import { normalizeUploadId, rawThumbKey, rawVideoKey } from "../src/media/s3-raw-keys.js";

describe("s3-raw-keys", () => {
  it("builds stable keys for uploadId", () => {
    const id = "aB0b1c2d-3e4f-5678-9abc-def012345678";
    const n = normalizeUploadId(id);
    expect(rawVideoKey(n)).toBe(`uploads/raw/${n}/video.bin`);
    expect(rawThumbKey(n)).toBe(`uploads/raw/${n}/thumb.jpg`);
  });
});
