// Monthly dump snapshots in R2 (S3-compatible), uploaded while the dump streams in.

import type { Readable } from "node:stream";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export type SnapshotStore = {
  /** Streams `body` to `key`; resolves when the multipart upload completes. */
  upload(key: string, body: Readable): Promise<void>;
  delete(key: string): Promise<void>;
};

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2Store(config: R2Config): SnapshotStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async upload(key, body) {
      const upload = new Upload({
        client,
        params: { Bucket: config.bucket, Key: key, Body: body, ContentType: "application/gzip" },
        partSize: 64 * 1024 * 1024,
        queueSize: 2,
      });
      await upload.done();
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

export function snapshotKey(fileName: string): string {
  return `dumps/${fileName}`;
}
