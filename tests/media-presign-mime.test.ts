// tests/media-presign-mime.test.ts
import { describe, expect, it } from "vitest";
import {
  ALLOWED_THUMB_CONTENT_TYPES,
  assertAllowedThumbContentType,
  assertAllowedVideoContentType,
} from "../src/media/presign-mime.js";

describe("presign-mime", () => {
  it("allows jpeg thumb", () => {
    expect(() => assertAllowedThumbContentType("image/jpeg")).not.toThrow();
  });
  it("rejects gif", () => {
    expect(() => assertAllowedThumbContentType("image/gif")).toThrow();
  });
  it("documents allowed thumb set", () => {
    expect(ALLOWED_THUMB_CONTENT_TYPES.has("image/webp")).toBe(true);
  });
  it("allows mp4 video", () => {
    expect(() => assertAllowedVideoContentType("video/mp4")).not.toThrow();
  });
});
