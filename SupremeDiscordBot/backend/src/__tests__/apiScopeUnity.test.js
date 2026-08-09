// backend/src/__tests__/apiScopeUnity.test.js
// Всеки scope, който маршрут ИЗИСКВА, може да бъде ИЗДАДЕН.
//
// ДЕФЕКТЪТ (одит 09.08.2026): два дрейфнали списъка VALID_SCOPES — в монтирания
// издател и в немонтирания файл-примамка apikeys.js, от който v1.js внасяше
// requireApiKey. v1 изискваше `server:read`, издателят го отказваше →
// GET /api/v1/server беше ВЕЧНО 403 за всеки възможен ключ. 474 теста бяха
// зелени, защото никой не сверяваше ИЗИСКВАНОТО срещу ИЗДАВАНОТО.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VALID_SCOPES } from "../lib/apiKeyAuth.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(SRC, p), "utf-8");

describe("scope-овете са ЕДНО определение", () => {
  it("всеки изискан scope в v1.js и publicApi.js е издаваем", () => {
    const demanded = new Set();
    for (const f of ["routes/v1.js", "routes/publicApi.js"]) {
      for (const m of read(f).matchAll(/requireApiKey\("([^"]+)"\)/g)) demanded.add(m[1]);
    }
    expect(demanded.size, "нула изисквания значи остарял тест").toBeGreaterThan(3);
    for (const s of demanded) {
      expect(VALID_SCOPES, `маршрут иска „${s}", който издателят не предлага → вечно 403`).toContain(s);
    }
  });

  it("не се издават scope-ове без нито един маршрут", () => {
    const src = read("routes/v1.js") + read("routes/publicApi.js");
    for (const s of VALID_SCOPES) {
      expect(src, `издава се „${s}", а маршрут за него няма — продадена възможност, която не съществува`)
        .toContain(`"${s}"`);
    }
  });

  it("файлът-примамка не се е върнал", () => {
    expect(existsSync(join(SRC, "routes", "apikeys.js")),
      "apikeys.js пак съществува — вторият списък scope-ове ще дрейфне отново").toBe(false);
  });

  it("никой не дефинира втори VALID_SCOPES масив", () => {
    for (const f of ["routes/v1.js", "routes/publicApi.js"]) {
      const defs = read(f).match(/const VALID_SCOPES\s*=\s*\[/g) || [];
      expect(defs.length, `${f} дефинира собствен списък — една дефиниция, в lib/apiKeyAuth.js`).toBe(0);
    }
  });
});
