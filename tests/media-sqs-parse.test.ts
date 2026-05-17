import { describe, expect, it } from "vitest";
import {
  parseS3RecordsFromMessage,
  uploadIdFromThumbKey,
} from "../src/jobs/media-pipeline-sqs-worker.js";

describe("media-pipeline-sqs-worker", () => {
  it("parses raw S3 notification", () => {
    const body = JSON.stringify({
      Records: [
        {
          s3: {
            bucket: { name: "my-bucket" },
            object: { key: "uploads%2Fraw%2F11111111-2222-4333-8444-555555555555%2Fthumb.jpg" },
          },
        },
      ],
    });
    const refs = parseS3RecordsFromMessage(body);
    expect(refs).toEqual([
      { bucket: "my-bucket", key: "uploads/raw/11111111-2222-4333-8444-555555555555/thumb.jpg" },
    ]);
  });

  it("extracts uploadId from thumb key", () => {
    expect(
      uploadIdFromThumbKey("uploads/raw/11111111-2222-4333-8444-555555555555/thumb.jpg"),
    ).toBe("11111111-2222-4333-8444-555555555555");
  });
});
