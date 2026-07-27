// Symmetric secret encryption (AES-256-GCM) for tokens stored at rest.
//
// Used for the GitHub PAT behind the auto-fix PR loop: a repo-write token must
// never sit in the DB as plaintext. GCM gives us authenticated encryption, so a
// tampered ciphertext fails to decrypt instead of silently returning garbage.
// The 32-byte key is derived from an app secret (SHA-256), so no extra key
// management is needed beyond the existing env secret.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function keyFrom(secret: string): Buffer {
  if (!secret) throw new Error("encryption secret is empty");
  return createHash("sha256").update(secret).digest(); // always 32 bytes
}

// Returns "iv:tag:ciphertext" (all hex). IV is random per call.
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

// The app secret used for at-rest encryption. Dedicated var preferred, falls
// back to the JWT secret which is always configured.
export function appSecret(): string {
  return process.env.AUTOFIX_SECRET || process.env.JWT_ACCESS_SECRET || "";
}
