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

describe("decryptSafe — какво връща при провал (07.08.2026)", () => {
  it("наследен открит текст минава непокътнат", async () => {
    const { decryptSafe } = await import("../lib/crypto.js");
    expect(decryptSafe("plain-legacy-token")).toBe("plain-legacy-token");
    // Открит текст СЪС двоеточия — старата проверка `split(":").length === 3`
    // го броеше за наш шифротекст и се опитваше да го дешифрира.
    expect(decryptSafe("Bearer:foo:bar")).toBe("Bearer:foo:bar");
  });

  it("нашият шифротекст се дешифрира", async () => {
    const { encrypt, decryptSafe } = await import("../lib/crypto.js");
    expect(decryptSafe(encrypt("tok_123"))).toBe("tok_123");
  });

  it("НЕ връща шифротекста при грешен ключ — иначе го пращаме на Discord", async () => {
    const { encrypt, decryptSafe } = await import("../lib/crypto.js");
    const cipher = encrypt("tok_123");
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "b".repeat(64); // сменен ключ
    try {
      // null → повикващият иска нов вход. Суровият шифротекст би тръгнал
      // нататък като OAuth токен и би дал объркващо 401 без диагноза.
      expect(decryptSafe(cipher)).toBeNull();
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });

  it("НЕ връща шифротекста при ЛИПСВАЩ ключ", async () => {
    const { encrypt, decryptSafe } = await import("../lib/crypto.js");
    const cipher = encrypt("tok_123");
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      expect(decryptSafe(cipher)).toBeNull();
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
