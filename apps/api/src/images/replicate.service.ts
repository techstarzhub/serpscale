import { Injectable, Logger } from "@nestjs/common";

// Cheapest solid image model on Replicate; overridable per deployment.
const DEFAULT_MODEL = "black-forest-labs/flux-schnell";
const API = "https://api.replicate.com/v1";

/**
 * Thin Replicate client for text-to-image. Pay-as-you-go: only the
 * REPLICATE_API_TOKEN is needed. Never throws into the request path — a missing
 * token or a provider error yields `null` so the caller can degrade gracefully
 * (e.g. write the blog without images).
 */
@Injectable()
export class ReplicateService {
  private readonly logger = new Logger(ReplicateService.name);
  private get token() { return process.env.REPLICATE_API_TOKEN || ""; }
  private get model() { return process.env.REPLICATE_IMAGE_MODEL || DEFAULT_MODEL; }

  isEnabled(): boolean {
    return Boolean(this.token);
  }

  /** Build the model-specific input. Flux takes webp/quality/num_outputs; other
   *  families (Ideogram, Imagen, Recraft, gpt-image…) just take prompt + aspect
   *  ratio and pick their own output format. */
  private buildInput(model: string, prompt: string, aspectRatio: string): Record<string, unknown> {
    if (model.startsWith("black-forest-labs/flux")) {
      return { prompt, aspect_ratio: aspectRatio, output_format: "webp", output_quality: 90, num_outputs: 1 };
    }
    if (model.startsWith("ideogram-ai/")) {
      // Ideogram renders text cleanly; "Auto" magic-prompt keeps our wording.
      return { prompt, aspect_ratio: aspectRatio, magic_prompt_option: "Off" };
    }
    // Google Imagen, Recraft, gpt-image, etc. — a safe common subset.
    return { prompt, aspect_ratio: aspectRatio };
  }

  /** Generate one image; returns its bytes + content type, or null on any failure. */
  async generate(prompt: string, opts: { aspectRatio?: string } = {}): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.isEnabled()) return null;
    const clean = prompt.trim().slice(0, 1500);
    if (!clean) return null;
    try {
      // Low-credit Replicate accounts are throttled hard (6/min, burst of 1), so
      // bursts of predictions get 429s. Back off and retry rather than dropping
      // the image. Transient 404/5xx get a short retry too.
      let created: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        created = await fetch(`${API}/models/${this.model}/predictions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            Prefer: "wait", // block up to ~60s so most requests return already-done
          },
          body: JSON.stringify({ input: this.buildInput(this.model, clean, opts.aspectRatio || "16:9") }),
        });
        if (created.ok) break;
        if (created.status === 429) {
          const ra = Number(created.headers.get("retry-after"));
          const waitMs = (Number.isFinite(ra) && ra > 0 ? ra : 12) * 1000;
          this.logger.warn(`replicate throttled (429); waiting ${waitMs / 1000}s, retry ${attempt + 1}/4`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        if (created.status === 404 || created.status >= 500) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        break; // e.g. 402 insufficient credit — retrying won't help
      }
      if (!created || !created.ok) {
        const detail = created ? await created.text().catch(() => "") : "no response";
        this.logger.warn(`replicate create failed ${created?.status}: ${detail.slice(0, 160)}`);
        return null;
      }
      let pred = (await created.json()) as { id: string; status: string; output?: unknown };
      // If "wait" didn't fully resolve it, poll briefly until it settles.
      const deadline = Date.now() + 60_000;
      while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
        if (Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 700));
        const poll = await fetch(`${API}/predictions/${pred.id}`, { headers: { Authorization: `Bearer ${this.token}` } });
        if (!poll.ok) return null;
        pred = (await poll.json()) as typeof pred;
      }
      if (pred.status !== "succeeded") return null;
      const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      if (typeof url !== "string" || !url.startsWith("http")) return null;
      const img = await fetch(url);
      if (!img.ok) return null;
      const ct = img.headers.get("content-type") || "";
      const contentType = /^image\/(webp|png|jpe?g|avif)/.test(ct) ? ct.split(";")[0] : "image/webp";
      return { buffer: Buffer.from(await img.arrayBuffer()), contentType };
    } catch (e) {
      this.logger.warn(`replicate error: ${String(e).slice(0, 120)}`);
      return null;
    }
  }
}
