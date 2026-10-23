// backend/src/__tests__/redactUrl.test.js
// Access логът (morgan) не пази тайните от адреса: `code`/`state` на входа през
// Discord и `t` — токенът на архивния транскрипт (ключът към лични данни).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecretParams } from "../lib/redactUrl.js";

describe("redactSecretParams", () => {
  it("маскира code и state на callback-а, пази пътя и останалото", () => {
    expect(redactSecretParams("/api/auth/callback?code=abc123&state=f00d&iss=https%3A%2F%2Fdiscord.com"))
      .toBe("/api/auth/callback?code=[redacted]&state=[redacted]&iss=https%3A%2F%2Fdiscord.com");
  });

  it("маскира токена на транскрипта", () => {
    expect(redactSecretParams("/archive/ticket/ck123?t=0123456789abcdef")).toBe("/archive/ticket/ck123?t=[redacted]");
  });

  it("не пипа параметри, които само съдържат името (cursor=, start=)", () => {
    expect(redactSecretParams("/api/x?cursor=5&start=2&sort=t")).toBe("/api/x?cursor=5&start=2&sort=t");
  });

  it("адрес без query и стойност, която не е низ, минават непроменени", () => {
    expect(redactSecretParams("/api/health")).toBe("/api/health");
    expect(redactSecretParams(undefined)).toBe(undefined);
  });
});

describe("index.js ползва маскирането ПРЕДИ да монтира morgan", () => {
  it("token-ът url е предефиниран преди app.use(morgan(...))", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.js"), "utf8");
    const token = src.indexOf('morgan.token("url"');
    const mount = src.indexOf("app.use(morgan(");
    expect(token).toBeGreaterThan(-1);
    expect(token).toBeLessThan(mount);
    expect(src.slice(token, mount)).toContain("redactSecretParams(");
  });

  it("глобалният обработчик на грешки също не пише суровия адрес", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.js"), "utf8");
    const errLog = src.match(/console\.error\(`\[err \$\{id\}\][^\n]*/);
    expect(errLog, "редът на обработчика на грешки липсва").toBeTruthy();
    expect(errLog[0]).toContain("redactSecretParams(");
    expect(errLog[0]).not.toMatch(/\$\{req\.originalUrl\}/);
  });
});
