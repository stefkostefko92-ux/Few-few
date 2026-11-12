// bot/src/__tests__/roleGrantGuard.test.js
// Всяко място, където ботът ДАВА роля, минава през същия гард
// (`roleAssignabilityReason` / `isRoleSafeToSelfAssign`): управлявана, опасна
// (Administrator, Manage Roles…) или над бота роля НЕ се дава.
//
// Защо гейт върху самия код: червеният екип (10.10.2026) намери два пътя —
// успешна верификация и одобрена кандидатура — които даваха ролите без гарда.
// Човек само с Manage Server слагаше роля с Administrator в панела и се
// верифицираше сам. Autorole, лепкавите роли, реакциите и играта бяха
// защитени; новите два — не. Нов `roles.add(` без гард пада тук.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "__tests__" || n === "node_modules") return [];
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
  });
}
const GUARD = /roleAssignabilityReason\(|isRoleSafeToSelfAssign\(/;
const WINDOW = 25; // реда назад в същата функция

describe("всяко даване на роля минава през гарда", () => {
  const sites = [];
  for (const f of files(SRC)) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.trim().startsWith("//")) return;
      if (/\.roles\.add\(/.test(line)) sites.push({ file: relative(SRC, f), line: i + 1, before: lines.slice(Math.max(0, i - WINDOW), i + 1).join("\n") });
    });
  }

  it("намира местата (иначе гейтът е сляп)", () => {
    expect(sites.length).toBeGreaterThanOrEqual(7);
  });

  it.each(sites.map((s) => [`${s.file}:${s.line}`, s]))("%s е зад гарда", (_, s) => {
    expect(s.before, `${s.file}:${s.line} дава роля без roleAssignabilityReason/isRoleSafeToSelfAssign`).toMatch(GUARD);
  });
});
