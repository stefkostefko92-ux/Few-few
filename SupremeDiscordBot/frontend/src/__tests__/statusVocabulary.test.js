// frontend/src/__tests__/statusVocabulary.test.js
// Фронтендът сравнява със СЪЩИТЕ думи, които backend-ът връща.
//
// ДЕФЕКТЪТ (продукция, 07.08.2026): гербът на командния екран пишеше „BOT
// OFFLINE" на напълно жив бот. Причината:
//
//   ServerHome.jsx:  botOnline={status?.services?.bot?.status === "ok"}
//   status.js:       results.services.bot = { status: "operational" | "degraded" | "down" }
//
// „ok" е думата от ВЪТРЕШНИЯ `/health` на бота (`bot/src/index.js`), която
// backend-ът вече е превел на речника на статус страницата. Сравнението беше
// винаги невярно — тоест значката не показваше състояние, а константа.
//
// Това е дефект, който тест с мок НЕ хваща: мокът щеше да върне каквото авторът
// на теста си мисли, че връща API-то. Затова тук се чете ИСТИНСКИЯТ изходен код
// на двете страни и се сверява речникът.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATUS_ROUTE = join(HERE, "..", "..", "..", "backend", "src", "routes", "status.js");
const SRC = join(HERE, "..");

/** Думите, които backend-ът наистина слага в `services.*.status`. */
function backendVocabulary() {
  const src = readFileSync(STATUS_ROUTE, "utf8");
  const words = new Set();
  for (const m of src.matchAll(/status:\s*"([a-z]+)"/g)) words.add(m[1]);
  for (const m of src.matchAll(/status:\s*\w+\s*\?\s*"([a-z]+)"\s*:\s*"([a-z]+)"/g)) {
    words.add(m[1]); words.add(m[2]);
  }
  return words;
}

function frontendComparisons() {
  const files = ["pages/ServerHome.jsx", "pages/StatusPage.jsx"];
  const out = [];
  for (const f of files) {
    const src = readFileSync(join(SRC, f), "utf8");
    for (const m of src.matchAll(/services\??\.\w+\??\.status\s*===\s*"([a-z]+)"/g)) {
      out.push({ file: f, word: m[1] });
    }
  }
  return out;
}

describe("речникът на статуса е един и същ от двете страни", () => {
  it("backend-ът наистина говори operational/degraded/down", () => {
    const vocab = backendVocabulary();
    expect(vocab.has("operational")).toBe(true);
    expect(vocab.has("down")).toBe(true);
    expect(vocab.has("ok"), "„ok\" е дума на ВЪТРЕШНИЯ /health, не на /api/status").toBe(false);
  });

  it("всяко сравнение във фронтенда ползва дума, която backend-ът връща", () => {
    const vocab = backendVocabulary();
    const comparisons = frontendComparisons();
    expect(comparisons.length, "нищо за проверка значи, че regex-ът е остарял").toBeGreaterThan(0);
    for (const { file, word } of comparisons) {
      expect(vocab.has(word), `${file} сравнява с „${word}", което API-то никога не връща`).toBe(true);
    }
  });
});
