// backend/src/__tests__/crypto.test.js
import { describe, it, expect, beforeAll } from "vitest";

// Set up required env before importing crypto
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "a".repeat(64); // 64 hex chars = 32 bytes
});

const { encrypt, decrypt } = await import("../lib/crypto.js");

describe("AES-256-GCM crypto", () => {
  it("encrypts and decrypts a string correctly", () => {
    const plain = "my-secret-bot-token-abc123";
    const cipher = encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(cipher).toContain(":");           // iv:tag:data format
    expect(cipher.split(":")).toHaveLength(3);
    expect(decrypt(cipher)).toBe(plain);
  });

  it("returns null for null input", () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });

  it("returns null for empty string input", () => {
    expect(encrypt("")).toBeNull();
    expect(decrypt("")).toBeNull();
  });

  it("produces different ciphertext each call (random IV)", () => {
    const plain = "same-input";
    const a = encrypt(plain);
    const b = encrypt(plain);
    expect(a).not.toBe(b);          // different IV each time
    expect(decrypt(a)).toBe(plain); // but both decrypt correctly
    expect(decrypt(b)).toBe(plain);
  });

  it("throws on tampered ciphertext", () => {
    const cipher = encrypt("hello");
    const tampered = cipher.slice(0, -4) + "XXXX";
    expect(() => decrypt(tampered)).toThrow();
  });
});
