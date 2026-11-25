// authErrorParity.test.js — всеки `?error=<код>`, с който backend-ът връща
// човек от входа през Discord, има СВОЕ съобщение на началната страница.
//
// Реален случай (10.10.2026): изтекъл/повторен вход, отказ в Discord и сгрешен
// DISCORD_CLIENT_SECRET показваха едно и също „Discord authentication failed“.
// Нов код в routes/auth.js без съобщение тук би паднал тихо към общия текст —
// гейтът го хваща.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AUTH_ERROR_MESSAGES, authErrorMessage } from "../components/AuthErrorNotice.jsx";

const authRoute = readFileSync(join(__dirname, "..", "..", "..", "backend", "src", "routes", "auth.js"), "utf8");
const emitted = [...new Set([...authRoute.matchAll(/\/\?error=([a-z_]+)/g)].map((m) => m[1]))];

describe("кодовете за грешка при вход — backend ↔ начална страница", () => {
  it("backend-ът наистина връща кодове (иначе гейтът е празен)", () => {
    expect(emitted).toEqual(expect.arrayContaining(["oauth_expired", "oauth_failed", "oauth_denied", "no_code"]));
  });

  it.each(emitted)("„%s“ има собствено съобщение", (code) => {
    expect(Object.hasOwn(AUTH_ERROR_MESSAGES, code)).toBe(true);
    expect(authErrorMessage(code)).toBe(AUTH_ERROR_MESSAGES[code]);
  });

  it("непознат код пада към общия текст, а не към прототипа на обекта", () => {
    expect(authErrorMessage("toString")).toBe(authErrorMessage("no_such_code"));
  });
});
