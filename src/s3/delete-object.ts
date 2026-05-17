// src/s3/delete-object.ts
import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export async function deleteS3Object(params: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<void> {
  await params.client.send(
    new DeleteObjectCommand({ Bucket: params.bucket, Key: params.key }),
  );
}
