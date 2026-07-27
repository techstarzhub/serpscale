import { Injectable } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 (S3-compatible) storage. All keys are namespaced under
// R2_KEY_PREFIX so this app never touches objects that belong to other apps
// sharing the same bucket, and deletes are guarded to that prefix.
@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
  private readonly bucket = process.env.R2_BUCKET || "";
  private readonly prefix = (process.env.R2_KEY_PREFIX || "seo-platform").replace(/\/+$/, "");

  /** Build a namespaced key (always under our prefix). */
  key(...parts: string[]): string {
    return [this.prefix, ...parts].join("/").replace(/\/+/g, "/");
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    this.assertOwned(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  }

  async remove(key: string): Promise<void> {
    this.assertOwned(key); // never delete outside our prefix
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(key: string, expiresIn = 60 * 60 * 24): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  private assertOwned(key: string) {
    if (!key.startsWith(this.prefix + "/")) {
      throw new Error(`Refusing to touch key outside prefix "${this.prefix}": ${key}`);
    }
  }
}
