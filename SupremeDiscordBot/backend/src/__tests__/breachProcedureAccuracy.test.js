// backend/src/__tests__/breachProcedureAccuracy.test.js
// `legal/breach-procedure.md` описва РЕАЛНОСТТА, не намеренията.
//
// ЗАЩО (одит етап 13, 12.08.2026): документът изброяваше „Rate limiter hits on
// auth endpoints (weekly review)" и „Database audit log anomaly detection
// (monthly review)" под заглавие **Automated monitoring**. Нито едното не е
// автоматично — нищо не алармира и нищо не върви по график. Правен документ,
// който приписва на контролера откриваемост, каквато няма, е по-опасен от
// липсващ: 72-часовият часовник по чл. 33 GDPR тръгва от „узнаване", а
// узнаването зависи именно от тези източници.
//
// Тук се гейтва ВРЪЗКАТА документ↔код: името на одиторското действие, което
// процедурата казва да се търси при седмичния преглед, трябва да е точно това,
// което кодът записва. Преименуване в кода без преименуване в документа
// оставя прегледа да търси низ, който не съществува — и да не намери нищо,
// което изглежда точно като „няма атаки".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROCEDURE = join(SRC, "..", "..", "legal", "breach-procedure.md");
const BRUTE_FORCE = join(SRC, "lib", "bruteForce.js");

const doc = readFileSync(PROCEDURE, "utf8");
const code = readFileSync(BRUTE_FORCE, "utf8");

describe("процедурата при пробив съвпада с кода", () => {
  it("действието, което кодът записва, е точно това, което документът праща да търсиш", () => {
    const inCode = [...code.matchAll(/action:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(inCode, "bruteForce.js вече не пише одиторско действие").toContain(
      "SECURITY_BRUTE_FORCE_BLOCK",
    );
    expect(
      doc,
      "процедурата не назовава действието — седмичният преглед няма какво да търси",
    ).toContain("SECURITY_BRUTE_FORCE_BLOCK");
  });

  it("ръчният преглед НЕ е представен като автоматичен", () => {
    const automated = doc.slice(
      doc.indexOf("**Automated monitoring**"),
      doc.indexOf("**Periodic human review**"),
    );
    expect(automated.length, "разделите липсват — документът е преструктуриран").toBeGreaterThan(0);
    for (const manual of [/monthly/i, /weekly review/i]) {
      expect(
        automated,
        `ръчна периодична задача стои под „автоматично наблюдение": ${manual}`,
      ).not.toMatch(manual);
    }
  });

  it("полетата на metadata, обещани на прегледащия, реално се записват", () => {
    // Документът казва какво ще намери човекът в `metadata`. Ако кодът спре да
    // го пише, прегледът остава без данните, на които стъпва решението за тежест.
    const meta = code.match(/metadata:\s*\{([^}]*)\}/);
    expect(meta, "не намирам metadata обекта в одиторския запис").not.toBeNull();
    for (const field of ["scope", "kind", "key", "failures", "blockMs"]) {
      expect(meta[1], `metadata не носи обещаното поле ${field}`).toContain(field);
      expect(doc, `документът не описва полето ${field}`).toContain(field);
    }
  });

  it("източник, обявен за условен, е обявен ЧЕСТНО (Sentry без DSN не съществува)", () => {
    expect(doc).toMatch(/SENTRY_DSN/);
  });
});
