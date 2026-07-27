import { encryptSecret, decryptSecret } from "./crypto";

const SECRET = "test-app-secret-value";

describe("crypto (AES-256-GCM)", () => {
  it("round-trips a token", () => {
    const token = "ghp_ABCdef1234567890";
    const cipher = encryptSecret(token, SECRET);
    expect(cipher).not.toContain(token); // never stored in the clear
    expect(decryptSecret(cipher, SECRET)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same", SECRET)).not.toBe(encryptSecret("same", SECRET));
  });

  it("fails to decrypt with the wrong secret", () => {
    const cipher = encryptSecret("hunter2", SECRET);
    expect(() => decryptSecret(cipher, "wrong-secret")).toThrow();
  });

  it("detects tampering (auth tag)", () => {
    const cipher = encryptSecret("hunter2", SECRET);
    const [iv, tag, data] = cipher.split(":");
    const flipped = data.slice(0, -1) + (data.slice(-1) === "a" ? "b" : "a");
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`, SECRET)).toThrow();
  });

  it("rejects malformed ciphertext", () => {
    expect(() => decryptSecret("not-valid", SECRET)).toThrow("malformed ciphertext");
  });
});
