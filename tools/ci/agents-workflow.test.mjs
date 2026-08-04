// agents-workflow.test.mjs — ТРИГЕРЪТ на гейта трябва да покрива всичко, което гейтът ПРОВЕРЯВА.
//
// Реален дефект (2026-08-04, доказан на живо): два комита в main (122039bf, afb3909c) смениха
// `vpsdash/CLAUDE.md` и НИЩО друго. Нито един от техните пътища не беше в тригера на `agents.yml`,
// затова workflow-ът НЕ се пусна → `docs.js` остаря на main без никакъв сигнал, а първият PR, който
// сля base, изяде червения гейт. Междувременно `deep-audit` (продуктова документация), `drift-lint`
// (бройка/ростер от CLAUDE.md), `docs-fresh` (таблото), `mascot-theme` (mascot/) и `deploy-check`
// (deploy/autodeploy.sh) четат точно тези пътища.
//
// Класът е същият, за който самият файл предупреждава в коментар: „Гейт, чийто обхват е по-тесен от
// това, което проверява, е зелен по слепота." Поправен веднъж за `tools/**`, но не и за останалите.
//
// Тук пазим ДВА инварианта: (1) всеки вход на гейта е в тригера; (2) `push` и `pull_request`
// филтрите СЪВПАДАТ — разминат ли се, PR минава зелен, а main се чупи (или обратното).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = join(ROOT, ".github", "workflows", "agents.yml");

/** Пътищата под `paths:` за даден тригер (push|pull_request). Зор-зависим парсер не ни трябва —
 *  структурата е наша и този тест я пази. */
function pathsOf(trigger) {
  const lines = readFileSync(WF, "utf8").split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\s{2}${trigger}:\\s*$`).test(l));
  assert.ok(start >= 0, `не намирам тригер „${trigger}" в agents.yml`);
  const out = [];
  let inPaths = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // Спри на СЪСЕДЕН ключ със същия отстъп (напр. `  pull_request:`) или на нов top-level ключ.
    // (Първата версия не спираше тук и `push` поглъщаше и двата блока → фалшив „разсинхрон".)
    if (/^\s{2}\S/.test(l) || /^\S/.test(l)) break;
    if (/^\s+paths:\s*$/.test(l)) { inPaths = true; continue; }
    if (inPaths) {
      const m = l.match(/^\s+-\s+"([^"]+)"\s*$/);
      if (m) { out.push(m[1]); continue; }
      if (/^\s*#/.test(l) || !l.trim()) continue;                  // коментар/празен ред
      if (/^\s+\w+:/.test(l)) inPaths = false;                     // следващ ключ
    }
  }
  return out;
}

// Вход на гейта → защо е нужен. Добавяш ли проверка, която чете НОВ път, добави го и тук.
const REQUIRED = [
  [".claude/agents/**", "oversee · deep-audit · invariant-check четат дефинициите и паметта"],
  [".claude/hooks/**", "liveness · guards тестовете пазят куките"],
  [".claude/settings.json", "oversee сверява регистрацията на куките"],
  [".claude/skills/**", "skills-lint · trigger-check"],
  ["tools/**", "целият гейт + `find tools -name '*.test.mjs'` пуска ВСИЧКИ тестове"],
  ["agents-dashboard/agents.json", "dashboard-sync (регистърът)"],
  ["agents-dashboard/index.html", "dashboard-sync (вграденият FALLBACK)"],
  ["agents-dashboard/docs.js", "docs-fresh — артефактът, който се сравнява"],
  ["CLAUDE.md", "drift-lint (ростер) · deep-audit (продуктова таблица) · docs-fresh"],
  ["**/CLAUDE.md", "deep-audit (всеки продукт със свой CLAUDE.md) · docs-fresh — РЕАЛНИЯТ пропуск"],
  ["mascot/**", "mascot-theme чете асетите на маскота"],
  ["deploy/**", "deploy-check валидира deploy/autodeploy.sh"],
];

for (const trigger of ["push", "pull_request"]) {
  test(`${trigger}: тригерът покрива всеки вход на гейта (иначе гейтът е зелен по слепота)`, () => {
    const paths = pathsOf(trigger);
    assert.ok(paths.length >= REQUIRED.length, `${trigger}.paths изглежда празен: ${paths.length}`);
    for (const [p, why] of REQUIRED)
      assert.ok(paths.includes(p), `${trigger}: липсва „${p}" в paths — ${why}`);
  });
}

test("push и pull_request филтрите СЪВПАДАТ (разминат ли се, PR е зелен, а main се чупи)", () => {
  assert.deepEqual([...pathsOf("push")].sort(), [...pathsOf("pull_request")].sort());
});

test("реалният пропуск: промяна САМО в продуктов CLAUDE.md вече пуска гейта", () => {
  // vpsdash/CLAUDE.md беше единственият смислен файл в двата комита, които заобиколиха гейта.
  const paths = pathsOf("pull_request");
  const covers = (file) => paths.some((p) =>
    p === file ||
    (p.endsWith("/**") && file.startsWith(p.slice(0, -3) + "/")) ||
    (p.startsWith("**/") && file.endsWith(p.slice(2))));
  assert.ok(covers("vpsdash/CLAUDE.md"), "vpsdash/CLAUDE.md трябва да е покрит от тригера");
  assert.ok(covers("mascot/mascot.svg"), "mascot/ трябва да е покрит");
  assert.ok(covers("deploy/autodeploy.sh"), "deploy/ трябва да е покрит");
});
