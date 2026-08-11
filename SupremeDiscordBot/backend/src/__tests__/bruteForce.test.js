// backend/src/__tests__/bruteForce.test.js
// Гейт на защитата срещу налучкване на тайни.
//
// ЗАЩО (заявка на собственика, 11.08.2026 — „нищо да не може да се брутфорсва"):
// рейт лимитерите броят ВСИЧКИ заявки еднакво и затова пазят ресурса, но не
// тайната. Стандартът (NIST SP 800-63B §5.2.2, OWASP ASVS V2.2.1) иска
// дроселиране точно на НЕУСПЕШНИТЕ опити с растящо наказание.
//
// Тестът пази четирите свойства, които правят защитата истинска, а не украса:
//   1. блокира след праг и наказанието РАСТЕ
//   2. успехът чисти историята (човешката грешка не се трупа вечно)
//   3. различните източници са НЕЗАВИСИМИ (един нападател не заключва света)
//   4. паметта е ОГРАНИЧЕНА (иначе самата защита е DoS вектор)
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  check, recordFailure, recordSuccess, bruteForceGuard,
  _resetBruteForceState, _stateSize,
  BRUTE_FORCE_STEPS, BRUTE_FORCE_MAX_ENTRIES,
} from "../lib/bruteForce.js";

// Одитният запис е fire-and-forget през динамичен import на prisma — мокваме
// го, за да не пипа база (и за да докажем, че се пише ВЕДНЪЖ на блокировка).
const auditCreate = vi.fn().mockResolvedValue({});
vi.mock("../lib/prisma.js", () => ({ prisma: { auditLog: { create: (...a) => auditCreate(...a) } } }));

const FIRST_STEP = [...BRUTE_FORCE_STEPS].sort((a, b) => a.failures - b.failures)[0];

beforeEach(() => {
  _resetBruteForceState();
  auditCreate.mockClear();
});

describe("прагове и растящо наказание", () => {
  it("под прага НЕ блокира — нормалната човешка грешка минава", () => {
    for (let i = 0; i < FIRST_STEP.failures - 1; i++) recordFailure("apikey", "1.2.3.4");
    expect(check("apikey", "1.2.3.4").blocked).toBe(false);
  });

  it("на прага блокира и връща време за изчакване", () => {
    let last;
    for (let i = 0; i < FIRST_STEP.failures; i++) last = recordFailure("apikey", "1.2.3.4");
    expect(last.blocked).toBe(true);
    expect(last.retryAfterSec).toBeGreaterThan(0);
    expect(check("apikey", "1.2.3.4").blocked).toBe(true);
  });

  it("наказанието РАСТЕ с упорството — не е плоско", () => {
    const steps = [...BRUTE_FORCE_STEPS].sort((a, b) => a.failures - b.failures);
    const seen = [];
    let n = 0;
    for (const s of steps) {
      while (n < s.failures) { recordFailure("botsecret", "9.9.9.9"); n++; }
      seen.push(check("botsecret", "9.9.9.9").retryAfterSec);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `стъпка ${i} трябва да е по-тежка от предишната`).toBeGreaterThan(seen[i - 1]);
    }
  });

  it("нов провал НЕ скъсява вече наложена по-тежка блокировка", () => {
    const steps = [...BRUTE_FORCE_STEPS].sort((a, b) => b.failures - a.failures);
    for (let i = 0; i < steps[0].failures; i++) recordFailure("apikey", "5.5.5.5");
    const heavy = check("apikey", "5.5.5.5").retryAfterSec;
    recordFailure("apikey", "5.5.5.5");
    expect(check("apikey", "5.5.5.5").retryAfterSec).toBeGreaterThanOrEqual(heavy - 1);
  });
});

describe("успех, изолация, одит", () => {
  it("успехът чисти историята — сбъркал веднъж не носи наказание вечно", () => {
    for (let i = 0; i < FIRST_STEP.failures - 1; i++) recordFailure("apikey", "1.2.3.4");
    recordSuccess("apikey", "1.2.3.4");
    for (let i = 0; i < FIRST_STEP.failures - 1; i++) recordFailure("apikey", "1.2.3.4");
    expect(check("apikey", "1.2.3.4").blocked).toBe(false);
  });

  it("източниците са НЕЗАВИСИМИ — един нападател не заключва останалите", () => {
    for (let i = 0; i < FIRST_STEP.failures; i++) recordFailure("apikey", "6.6.6.6");
    expect(check("apikey", "6.6.6.6").blocked).toBe(true);
    expect(check("apikey", "7.7.7.7").blocked).toBe(false);
  });

  it("обхватите са НЕЗАВИСИМИ — блокиран за архив не значи блокиран за API", () => {
    for (let i = 0; i < FIRST_STEP.failures; i++) recordFailure("archive", "8.8.8.8");
    expect(check("archive", "8.8.8.8").blocked).toBe(true);
    expect(check("apikey", "8.8.8.8").blocked).toBe(false);
  });

  it("одитният запис е ВЕДНЪЖ на блокировка, не на заявка", async () => {
    for (let i = 0; i < FIRST_STEP.failures + 10; i++) recordFailure("apikey", "3.3.3.3");
    await new Promise((r) => setTimeout(r, 10));
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("SECURITY_BRUTE_FORCE_BLOCK");
    // GDPR: пълният IP не влиза в одитната следа.
    expect(JSON.stringify(data.metadata)).not.toContain("3.3.3.3");
  });
});

describe("самата защита не е DoS вектор", () => {
  it("паметта е ограничена при нападател, който върти източници", () => {
    for (let i = 0; i < BRUTE_FORCE_MAX_ENTRIES + 5000; i++) {
      recordFailure("apikey", `10.0.${(i >> 8) & 255}.${i & 255}`);
    }
    expect(_stateSize()).toBeLessThanOrEqual(BRUTE_FORCE_MAX_ENTRIES + 1);
  });

  it("активните блокировки преживяват чистенето — не се самоосвобождават", () => {
    for (let i = 0; i < FIRST_STEP.failures; i++) recordFailure("apikey", "4.4.4.4");
    expect(check("apikey", "4.4.4.4").blocked).toBe(true);
    for (let i = 0; i < BRUTE_FORCE_MAX_ENTRIES + 2000; i++) {
      recordFailure("apikey", `11.0.${(i >> 8) & 255}.${i & 255}`);
    }
    expect(check("apikey", "4.4.4.4").blocked, "заливането не бива да освобождава блокиран").toBe(true);
  });
});

describe("bruteForceGuard (Express)", () => {
  function app() {
    const a = express();
    a.use(bruteForceGuard("apikey"));
    a.get("/x", (_req, res) => res.json({ ok: true }));
    return a;
  }

  it("пуска, докато няма блокировка", async () => {
    const res = await request(app()).get("/x");
    expect(res.status).toBe(200);
  });

  it("блокираните получават 429 + Retry-After ПРЕДИ маршрута", async () => {
    // supertest вика през 127.0.0.1 — блокираме точно този източник.
    for (let i = 0; i < FIRST_STEP.failures; i++) recordFailure("apikey", "::ffff:127.0.0.1");
    for (let i = 0; i < FIRST_STEP.failures; i++) recordFailure("apikey", "127.0.0.1");
    const res = await request(app()).get("/x");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.body.code).toBe("TOO_MANY_FAILED_ATTEMPTS");
  });
});
