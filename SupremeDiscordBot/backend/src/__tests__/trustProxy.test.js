// backend/src/__tests__/trustProxy.test.js
// `trust proxy` решава КОЙ адрес смятаме за клиентски — значи решава дали
// защитата срещу налучкване изобщо работи.
//
// ЗАЩО ГЕЙТ (одит сигурност, 12.08.2026): цялата стълба в `lib/bruteForce.js`
// (източник → подмрежа → широка мрежа) стъпва на `req.ip`. Стане ли
// `trust proxy` на `true`, Express вярва на ЦЯЛАТА верига `X-Forwarded-For`,
// включително на частта, която подава КЛИЕНТЪТ — тогава нападателят подава нов
// пръв адрес при всяка заявка и не се изчерпва никога. Тоест една дума тук
// обезсмисля целия слой, без да счупи нито един друг тест.
//
// Днешната стойност `["loopback", "uniquelocal"]` е вярна за нашата верига
// (хост nginx → nginx в контейнера → backend) и НЕ е подправима: nginx-ът
// ДОБАВЯ (`$proxy_add_x_forwarded_for`), а не заменя, значи най-десният
// нечастен адрес е реалният клиент. Двете условия се проверяват заедно —
// поотделно всяко изглежда безобидно.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = readFileSync(join(SRC, "index.js"), "utf8");
const nginx = readFileSync(join(SRC, "..", "..", "frontend", "nginx.conf"), "utf8");

describe("клиентският адрес не може да се подправи", () => {
  it("`trust proxy` НЕ вярва на цялата верига", () => {
    const m = index.match(/app\.set\(\s*["']trust proxy["']\s*,\s*([^)]+)\)/);
    expect(m, "не намирам настройката — тестът е сляп").not.toBeNull();
    const value = m[1].trim();
    expect(value, "`trust proxy: true` прави X-Forwarded-For подправим").not.toMatch(/^true$/);
    // Числото също е капан: „2 хопа" е вярно само докато веригата е точно 2.
    expect(value, "очаквам списък от доверени мрежи").toMatch(/loopback|uniquelocal/);
  });

  it("nginx ДОБАВЯ към X-Forwarded-For, а не го заменя", () => {
    // `proxy_set_header X-Forwarded-For $remote_addr` би изтрил веригата; тогава
    // и правилният `trust proxy` не помага, защото реалният клиент изчезва.
    const xff = [...nginx.matchAll(/proxy_set_header\s+X-Forwarded-For\s+([^;]+);/gi)]
      .map((x) => x[1].trim());
    expect(xff.length, "няма нито един X-Forwarded-For — тестът е сляп").toBeGreaterThan(0);
    for (const v of xff) {
      expect(v, `заменя веригата вместо да добавя: ${v}`).toBe("$proxy_add_x_forwarded_for");
    }
  });

  it("защитата срещу налучкване наистина стъпва на req.ip", () => {
    // Ако това спре да е вярно, горните две проверки пазят нещо неползвано.
    const bf = readFileSync(join(SRC, "lib", "bruteForce.js"), "utf8");
    expect(bf).toMatch(/req\.ip/);
  });
});
