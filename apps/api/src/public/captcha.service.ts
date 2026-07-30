import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

/**
 * Self-contained, stateless captcha for the public marketing forms.
 *
 * The server hands out a simple arithmetic question plus a signed token. The
 * token carries only an expiry + an HMAC of (answer, expiry) — never the answer
 * itself — so it can be verified later without any server-side storage. This
 * stops naive bots (they'd have to solve the sum) without depending on an
 * external service or API keys. If a real captcha (Cloudflare Turnstile /
 * hCaptcha) is configured later, it can replace this cleanly.
 */
@Injectable()
export class CaptchaService {
  private readonly secret = process.env.CAPTCHA_SECRET || process.env.JWT_ACCESS_SECRET || "serpscale-captcha-secret";
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes to fill the form

  private sign(answer: number, exp: number): string {
    return crypto.createHmac("sha256", this.secret).update(`${answer}.${exp}`).digest("hex");
  }

  /** Issue a fresh challenge: a human-readable question + an opaque token. */
  issue(): { token: string; question: string } {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    const answer = a + b;
    const exp = Date.now() + this.ttlMs;
    const token = `${exp}.${this.sign(answer, exp)}`;
    return { token, question: `What is ${a} + ${b}?` };
  }

  /** Verify a submitted answer against its token. Constant-time on the signature. */
  verify(token: string | undefined, answer: string | number | undefined): boolean {
    if (!token || answer == null || answer === "") return false;
    const parts = String(token).split(".");
    if (parts.length !== 2) return false;
    const exp = Number(parts[0]);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const num = Number(answer);
    if (!Number.isFinite(num)) return false;
    const expected = this.sign(num, exp);
    const got = parts[1];
    if (expected.length !== got.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
    } catch {
      return false;
    }
  }
}
