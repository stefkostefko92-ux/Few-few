// backend/src/__tests__/transcriptAtRestGate.test.js
// Гейт: транскриптът (archiveHtml) НИКОГА не се записва в открит текст.
//
// ДЕФЕКТЪТ (одит 26.09.2026): таблото и DSR пишеха през sealTranscript, но
// основният път — затваряне на тикет от бота (routes/bot.js), плюс изтриване и
// регенериране — пишеше `archiveHtml: html`. Единственият тест покриваше
// маршрута на таблото, затова гейтът беше зелен. Тук се проверява ПРАВИЛОТО
// по целия backend, не отделен маршрут.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Стойности, които са позволени след `archiveHtml:` — шифрирано, изчистено,
// маркер на ретенцията, или не-запис (select/where/изваждане от отговор).
const ALLOWED_VALUE = /^(sealTranscript\(|null\b|true\b|undefined\b|\{\s*not:\s*null\s*\}|\{\s*startsWith:|`<!-- anonymized|html\s*\}\s*;?\s*$)/;

describe("транскриптите се пишат само шифрирани", () => {
  const all = files(SRC).map((f) => ({ f: relative(SRC, f), src: readFileSync(f, "utf8").replace(/\/\/.*$/gm, "") }));

  it("намира файловете (санити)", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("всяко `archiveHtml: <стойност>` е sealTranscript / null / маркер / не-запис", () => {
    const bad = [];
    for (const { f, src } of all) {
      for (const m of src.matchAll(/archiveHtml\s*:\s*([^,\n]+)/g)) {
        const v = m[1].trim();
        // `ticket = { archiveHtml: html }` в archive.js е обект в паметта за отговора, не запис.
        if (f.endsWith("routes/archive.js") && /^html\s*\}/.test(v)) continue;
        if (!ALLOWED_VALUE.test(v) || /^html\b/.test(v)) bad.push(`${f}: archiveHtml: ${v}`);
      }
    }
    expect(bad, "запис на транскрипт без sealTranscript").toEqual([]);
  });

  it("всяко присвояване на променлива archiveHtml е sealTranscript или заварена стойност", () => {
    const bad = [];
    for (const { f, src } of all) {
      // `archiveHtml = …` като оператор (не `==`, не текст в лог шаблон `archiveHtml=${…}`).
      for (const m of src.matchAll(/(?:^|[\s;{(])archiveHtml\s*=(?!=)\s*([^;\n]+)/gm)) {
        const v = m[1].trim();
        if (v.startsWith("${")) continue;
        if (!/^(sealTranscript\(|existing\.archiveHtml\b)/.test(v)) bad.push(`${f}: archiveHtml = ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
