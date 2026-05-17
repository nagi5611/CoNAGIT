import { describe, expect, it } from "vitest";
import { detectImageKindFromMagic } from "../src/media/validate-s3-thumb.js";

describe("detectImageKindFromMagic", () => {
  it("detects jpeg", () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(detectImageKindFromMagic(b)).toBe("jpeg");
  });
  it("detects png", () => {
    const b = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageKindFromMagic(b)).toBe("png");
  });
});
