// build-artifact.test.mjs — билдът на галактиката за Artifact.
//
// Всеки случай тук е от РЕАЛЕН пропуск при ръчния билд (2026-08-18), не измислен:
//   · гардът четеше проза и обяви годен файл за негоден („<html>“ в текст вътре в docs.js);
//   · `</script>` във вграждано съдържание е истинската опасност — тя не се проверяваше;
//   · оставен относителен път (`./docs.js`, `./mascots/…`) не се вижда локално, но в артифакта
//     е блокиран от CSP — тоест дефект, който се появява ЕДВА след публикуване.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build, stripDocumentWrapper, mascotDataUris, assertPublishable } from "./build-artifact.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("stripDocumentWrapper: остава само съдържанието на head+body", () => {
  const out = stripDocumentWrapper(
    '<!doctype html>\n<html lang="bg">\n<head>\n<title>Т</title>\n</head>\n<body class="x">\n<p>тяло</p>\n</body>\n</html>');
  assert.match(out, /<title>Т<\/title>/);
  assert.match(out, /<p>тяло<\/p>/);
  assert.doesNotMatch(out, /<!doctype|<html|<\/body>/i);
});

test("stripDocumentWrapper хвърля, ако входът НЕ е цял документ (тих празен изход е по-лошо)", () => {
  assert.throws(() => stripDocumentWrapper("<p>само фрагмент</p>"), /не е цял документ/);
});

test("ЗЪБИ: `</script>` във вграждано съдържание се хваща (иначе блокът се затваря по-рано)", () => {
  assert.throws(
    () => assertPublishable("<script>x</script>", { "docs.js": 'var s = "</script>";' }),
    /затвори блока по-рано/);
});

test("ЗЪБИ: останал обвиващ таг в РАЗМЕТКАТА се хваща", () => {
  assert.throws(() => assertPublishable("<p>a</p>\n</body>"), /остана обвиващ таг/);
});

test("НЕ пада върху проза: „<html>“ вътре в скрипт е низ, не таг (реалният фалшив позитив)", () => {
  // Точно този вход обяви първата версия на гарда за негоден. Съдържанието на `<script>` не е
  // разметка — гейт, който го чете като разметка, спира годен файл.
  const html = '<p>ок</p>\n<script>var d = {t: "и знакът `<html>` наследява"};</script>';
  assert.equal(assertPublishable(html), true);
  // Същото за `<style>`.
  assert.equal(assertPublishable('<style>/* <body> в коментар */</style>'), true);
});

test("mascotDataUris: data: URI с кодирани кавички (иначе чупят атрибута)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mascots-"));
  writeFileSync(join(dir, "test-agent-icon.svg"), '<svg\n  viewBox="0 0 8 8"><path d="M0 0"/></svg>');
  writeFileSync(join(dir, "test-agent.svg"), "<svg>пълният, не се вгражда</svg>");
  const icons = mascotDataUris(dir);
  assert.deepEqual(Object.keys(icons), ["test-agent"], "вгражда се САМО `-icon.svg` вариантът");
  assert.match(icons["test-agent"], /^data:image\/svg\+xml,/);
  assert.doesNotMatch(icons["test-agent"], /"/, "сурова кавичка би прекъснала src=\"…\"");
  assert.match(decodeURIComponent(icons["test-agent"]), /viewBox="0 0 8 8"/);
});

test("реалният билд: нула относителни пътища (в артифакта CSP ги блокира)", () => {
  const { html } = build();
  assert.doesNotMatch(html, /\.\/docs\.js/, "docs.js трябва да е вграден");
  assert.doesNotMatch(html, /\.\/mascots\//, "маскотите трябва да са data: URI");
  assert.match(html, /const MASCOT_ICONS = \{/);
  // `agents.json` СЪЗНАТЕЛНО остава: пада тихо и кодът минава на вградения FALLBACK.
  assert.match(html, /fetch\("\.\/agents\.json"\)/);
});

test("реалният билд: числата идват от регистъра, не от спомен", () => {
  const { agents, lessons, icons } = build();
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  const list = Array.isArray(reg) ? reg : reg.agents;
  assert.equal(agents, list.length, "брой агенти в артифакта = брой в регистъра");
  assert.equal(lessons, list.reduce((s, a) => s + (a.knowledge?.lessons ?? 0), 0), "сумата поуки съвпада с регистъра");
  assert.equal(icons, list.length, "всеки агент носи вграден маскот");
});

test("MASCOT_ICONS се обявява ПРЕДИ първата си употреба", () => {
  const { html } = build();
  assert.ok(html.indexOf("const MASCOT_ICONS") < html.indexOf("MASCOT_ICONS[id]"),
    "ръчният билд я слагаше след употребата — работеше по случайност, не по устройство");
});
