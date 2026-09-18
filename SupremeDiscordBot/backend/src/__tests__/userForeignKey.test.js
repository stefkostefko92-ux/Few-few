// backend/src/__tests__/userForeignKey.test.js
// Discord ID ≠ наш потребител. Всяко поле с външен ключ към `users` иска ред.
//
// ДЕФЕКТЪТ (одит 11.08.2026): половината ни таблици сочат към `users` с
// ИСТИНСКИ външен ключ, а ID-тата идват от Discord — където мнозинството хора
// никога не са влизали в таблото ни.
//
// Открито беше, защото продукцията гърмеше на `POST /api/bot/server/register`
// (одитният запис с `actorId: guild.ownerId`). Проверката на целия клас после
// показа, че същото важи и за ГЛАВНАТА функция на продукта:
//   • `tickets.creatorId` (ON DELETE RESTRICT) — член без акаунт при нас НЕ
//     МОЖЕ да отвори тикет;
//   • `tickets.assigneeId` — персонал, който работи само през Discord, не може
//     да поеме тикет.
// Дефектът е бил открит и поправен ТОЧКОВО веднъж (при кандидатурите), но не и
// на причината — затова тук се пази целият клас, не отделният случай.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { ensureUserStub, ensureUserStubs } = await import("../lib/ensureUser.js");

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.upsert.mockResolvedValue({});
});

describe("ensureUserStub", () => {
  it("създава минимален ред, когато потребителят липсва", async () => {
    await ensureUserStub(prismaMock, "222222222222222222");
    const call = prismaMock.user.upsert.mock.calls.at(-1)[0];
    expect(call.where).toEqual({ id: "222222222222222222" });
    expect(call.create.id).toBe("222222222222222222");
  });

  it("НИКОГА не презаписва истински профил (update е празен)", async () => {
    await ensureUserStub(prismaMock, "1", { username: "stub" });
    expect(prismaMock.user.upsert.mock.calls.at(-1)[0].update).toEqual({});
  });

  it("празно ID е no-op, не грешка", async () => {
    await ensureUserStub(prismaMock, null);
    await ensureUserStub(prismaMock, undefined);
    await ensureUserStub(prismaMock, "");
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });

  it("ensureUserStubs дедуплицира и пропуска празните", async () => {
    await ensureUserStubs(prismaMock, ["a", "a", null, "b", undefined]);
    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(2);
  });
});

// Source-гейт: държи целия клас затворен, вместо да гони отделните случаи.
// Всеки НОВ запис към поле с външен ключ към `users` трябва да мине през
// помощника — иначе тестът пада и авторът вижда защо.
describe("нула записи към users-FK полета без ensureUserStub", () => {
  function walk(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith(".js")) out.push(p);
    }
    return out;
  }

  // Проверката е ПО БЛИЗОСТ до самото извикване, не по наличие във файла.
  // Първата версия питаше „съдържа ли файлът ensureUserStub" — и мутация,
  // която махна гарда от създаването на тикет, МИНА, защото друг маршрут в
  // същия файл още го викаше. Гейт, който не пада при премахнат гард, е
  // декорация.
  const WINDOW = 1500;
  function guardedBefore(src, index, pattern = /ensureUserStubs?\(/) {
    return pattern.test(src.slice(Math.max(0, index - WINDOW), index));
  }

  it("ВСЯКО създаване на тикет с creatorId осигурява потребителя точно преди себе си", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/ticket\.create\(/g)) {
        const block = src.slice(m.index, m.index + 400);
        if (!/creatorId/.test(block)) continue;
        if (!guardedBefore(src, m.index)) {
          offenders.push(`${file.replace(SRC, "src")}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(offenders, `тикет с creatorId без ensureUserStub наблизо: ${offenders.join(", ")}`).toEqual([]);
  });

  it("ВСЯКО назначаване на assigneeId от Discord осигурява потребителя", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      let offset = 0;
      for (const line of lines) {
        const idx = offset;
        offset += line.length + 1;
        // Само ЗАПИС, не филтър/селект. `req.user.id` е сесиен — по дефиниция
        // има ред в `users`, значи не иска гард.
        if (!/assigneeId:\s*(userId|assigneeId)\b/.test(line)) continue;
        if (/select|where|:\s*true/.test(line)) continue;
        if (!guardedBefore(src, idx)) {
          offenders.push(`${file.replace(SRC, "src")}:${lines.indexOf(line) + 1}`);
        }
      }
    }
    expect(offenders, `assigneeId от Discord без ensureUserStub наблизо: ${offenders.join(", ")}`).toEqual([]);
  });

  it("суров auditLog.create не пише actorId от НЕДОВЕРЕН източник", () => {
    // Тестът съди ИЗТОЧНИКА на актьора, не самото извикване. Безопасни са:
    //   • `req.user.id` — сесиен потребител, по дефиниция има ред в `users`;
    //   • `null` — системно действие (планировчик, бот).
    // Всичко друго (Discord ID от тяло на заявка) иска writeAudit.
    const SAFE = /actorId:\s*(null|req\.user\.id)\s*[,}]/;
    // `routes/gdpr.js` присвоява `const userId = req.user.id` и ползва него —
    // проверено, че НЯМА друг източник в този файл (гардът долу го налага).
    const SESSION_ALIAS = { "routes/gdpr.js": /actorId:\s*userId\s*[,}]/ };
    const offenders = [];
    for (const file of walk(SRC)) {
      const rel = file.replace(SRC + "/", "");
      if (rel === "lib/auditLog.js") continue;      // самият помощник
      const src = readFileSync(file, "utf8");
      if (SESSION_ALIAS[rel]) {
        // Псевдонимът е позволен САМО докато идва от сесията.
        const assigns = src.split("\n").filter((l) => /const\s+userId\s*=/.test(l));
        expect(assigns.length, `${rel}: userId трябва да идва само от сесията`).toBeGreaterThan(0);
        for (const a of assigns) {
          expect(a, `${rel}: userId вече НЕ идва от req.user.id — гардът отпада`).toMatch(/req\.user\.id/);
        }
      }
      if (!/auditLog\.create\(/.test(src)) continue;
      // ВАЖНО: гледаме само вътре в СУРОВИТЕ `auditLog.create(...)` блокове.
      // Сканиране на целия файл би флагвало и вече поправените `writeAudit`
      // извиквания в същия файл — гейт, който вика вълк по собствената поправка,
      // после се заглушава и спира да пази.
      for (const m of src.matchAll(/auditLog\.create\(/g)) {
        let depth = 0, j = m.index;
        while (j < src.length) {
          if (src[j] === "(") depth++;
          else if (src[j] === ")") { depth--; if (depth === 0) break; }
          j++;
        }
        const block = src.slice(m.index, j + 1);
        for (const line of block.split("\n")) {
          if (!/^\s*actorId:/.test(line)) continue;
          if (SAFE.test(line)) continue;
          if (SESSION_ALIAS[rel]?.test(line)) continue;
          offenders.push(`${rel} → ${line.trim()}`);
        }
      }
    }
    expect(offenders, `actorId от недоверен източник без writeAudit: ${offenders.join(" | ")}`).toEqual([]);
  });
});
