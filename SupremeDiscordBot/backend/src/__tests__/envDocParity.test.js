// backend/src/__tests__/envDocParity.test.js
// Имената в `.env.example` съвпадат с това, което кодът РЕАЛНО чете.
//
// ДЕФЕКТЪТ (одит етап 13, 12.08.2026): файлът документираше
// `DISCORD_SKU_AGENCY`, а `lib/premium.js` чете `DISCORD_SKU_AGENCY5` и
// `DISCORD_SKU_AGENCY10`. Оператор, следвал документацията, задаваше
// променлива, която НИКОЙ не чете — и покупка на Agency през Discord
// монетизацията тихо не даваше план. Паричен път, счупен от печатна грешка в
// документ.
//
// Гейтът е ЕДНОПОСОЧЕН нарочно: всяко име в `.env.example` трябва да
// съществува в кода. Обратното НЕ се изисква — има десетки незадължителни
// настройки с разумно подразбиране и документирането им е избор, не дълг.
// Обратната посока би принудила да се документира всяка вътрешна дребна
// променлива, което превръща файла в шум и хората спират да го четат.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_EXAMPLE = join(SRC, "..", ".env.example");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "__tests__" || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Всички имена, споменати в кода — през process.env.X ИЛИ през деструктуриране. */
function namesUsedInCode() {
  const used = new Set();
  for (const f of walk(SRC)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) used.add(m[1]);
    // `const e = process.env; … e.DISCORD_SKU_PREMIUM` — четенето през псевдоним
    // е точно случаят, в който наивният скан пропуска употребата.
    for (const m of src.matchAll(/\b[a-z]\.([A-Z][A-Z0-9_]{3,})\b/g)) used.add(m[1]);
  }
  return used;
}

describe("`.env.example` не документира имена, които кодът не чете", () => {
  const documented = [...readFileSync(ENV_EXAMPLE, "utf8")
    .matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);

  it("файлът изобщо съдържа променливи (иначе тестът е сляп)", () => {
    expect(documented.length).toBeGreaterThan(20);
  });

  it("всяко документирано име се чете някъде в кода", () => {
    const used = namesUsedInCode();
    // Инфраструктурни: четат се от docker-compose/скриптове, не от приложението.
    const INFRA = new Set([
      "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "REDIS_PASSWORD",
    ]);
    const ghosts = documented.filter((n) => !used.has(n) && !INFRA.has(n));
    expect(
      ghosts,
      `документирани, но никъде нечетени (оператор ще ги зададе напразно): ${ghosts.join(", ")}`,
    ).toEqual([]);
  });

  it("`scripts/stripe-setup.sh` печата имена, които кодът РЕАЛНО чете", () => {
    // Скриптът е истинският източник на стойности за оператора: той ги
    // отпечатва готови за поставяне в `.env`. Сгрешено име ТУК е по-опасно от
    // сгрешено в примерния файл — операторът копира изхода, без да мисли.
    const sh = readFileSync(join(SRC, "..", "..", "scripts", "stripe-setup.sh"), "utf8");
    // Внимание при писане на такъв израз: [A-Z_]+ реже „AGENCY5" до „AGENCY"
    // и ражда фалшива тревога — цифрите са част от името.
    const emitted = [...sh.matchAll(/env_line\s+([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(emitted.length, "не намирам отпечатани имена — тестът е сляп").toBeGreaterThan(4);
    const used = namesUsedInCode();
    const ghosts = emitted.filter((n) => !used.has(n));
    expect(
      ghosts,
      `скриптът дава на оператора имена, които никой не чете: ${ghosts.join(", ")}`,
    ).toEqual([]);
  });

  it("SKU имената за Discord монетизацията са точните", () => {
    // Паричният път, който вече беше счупен от разминаване в имената.
    const skus = documented.filter((n) => n.startsWith("DISCORD_SKU_"));
    expect(skus.sort()).toEqual([
      "DISCORD_SKU_AGENCY10", "DISCORD_SKU_AGENCY5",
      "DISCORD_SKU_PREMIUM", "DISCORD_SKU_WHITELABEL",
    ]);
  });
});
