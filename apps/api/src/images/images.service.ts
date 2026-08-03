import { Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { StorageService } from "../storage/storage.service";
import { ReplicateService } from "./replicate.service";

// Where blog images live under the storage prefix, and the public route that
// streams them back (so the URL embedded in a blog never expires).
const FOLDER = "blog-images";

/**
 * Generates an AI image and parks it in R2 under our prefix, returning a stable,
 * non-expiring public URL (served by MediaController) that can be embedded
 * straight into blog markdown. Degrades to null whenever generation is off or
 * fails — callers just skip the image.
 */
@Injectable()
export class ImagesService {
  constructor(
    private readonly replicate: ReplicateService,
    private readonly storage: StorageService,
  ) {}

  isEnabled(): boolean {
    return this.replicate.isEnabled();
  }

  private base(): string {
    return (process.env.API_PUBLIC_URL || "http://localhost:4000").replace(/\/+$/, "");
  }

  /** Generate → store in R2 → return a permanent public URL, or null on failure. */
  async create(projectId: string, prompt: string, opts: { aspectRatio?: string } = {}): Promise<{ url: string } | null> {
    const img = await this.replicate.generate(prompt, opts);
    if (!img) return null;
    // Use the real format the model returned (Ideogram/Imagen may send png/jpg).
    const ext = img.contentType.includes("png") ? "png" : /jpe?g/.test(img.contentType) ? "jpg" : img.contentType.includes("avif") ? "avif" : "webp";
    const file = `${randomBytes(12).toString("hex")}.${ext}`;
    const key = this.storage.key(FOLDER, projectId, file);
    try {
      await this.storage.put(key, img.buffer, img.contentType);
    } catch {
      return null;
    }
    return { url: `${this.base()}/media/${FOLDER}/${projectId}/${file}` };
  }

  /** Resolve a public media path back to a storage key (used by the stream route). */
  keyFor(projectId: string, file: string): string {
    return this.storage.key(FOLDER, projectId, file);
  }
}
