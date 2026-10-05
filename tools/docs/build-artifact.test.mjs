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

import { build, stripDocumentWrapper, mascotDataUris, assertPublishable, versionRegressions, mascot3dAsGlobal, mascot3dLoader, mascotPortraitUris } from "./build-artifact.mjs";

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

// Реален инцидент (2026-09-24): композитен билд взе index.html от работния клон — вграденият FALLBACK
// там спира на v15, а паметта е на v21. Артефактът показа агентите 6 версии назад. Числото на поуките
// съвпадаше (sync-dashboard оправя само него), затова нищо не падна.
test("ЗЪБИ: версиите в билда не могат да са под паметта (регресия на evolution)", () => {
  const html = (v) => `const FALLBACK = {"agents":[{"id":"a","evolution":[{"version":"1.0.0"},{"version":"${v}"}]}]};`;
  const mem = { agents: [{ id: "a", evolution: [{ version: "21.4.0" }] }] };
  assert.deepEqual(versionRegressions(html("21.4.0"), mem), []);
  assert.deepEqual(versionRegressions(html("22.0.0"), mem), [], "по-нова от паметта е наред");
  const r = versionRegressions(html("15.6.0"), mem);
  assert.equal(r.length, 1);
  assert.match(r[0], /a: 15\.6 < 21\.4/);
});

test("versionRegressions: липсващ агент в билда също е регресия", () => {
  const mem = { agents: [{ id: "a", evolution: [{ version: "1.0.0" }] }, { id: "b", evolution: [{ version: "2.0.0" }] }] };
  const r = versionRegressions(`{"agents":[{"id":"a","evolution":[{"version":"1.0.0"}]}]}`, mem);
  assert.equal(r.length, 1);
  assert.match(r[0], /b: липсва/);
});

// 3D навсякъде (2026-09-24): бъндълът влиза като вграден модул, не като `data:`/`blob:` импорт.
test("mascot3dAsGlobal: крайният export става глобал; без export — хвърля", () => {
  assert.equal(mascot3dAsGlobal("const a=1;\nexport {\n  a,\n  b\n};\n").trim(), "const a=1;\nwindow.__MASCOT3D__ = {\n  a,\n  b\n};");
  assert.throws(() => mascot3dAsGlobal("const a = 1;"), /export/);
});

test("ЗЪБИ: `</script>` в бъндъла не затваря вградения блок", () => {
  const out = mascot3dLoader('const s = "</script>";\nexport { s };');
  assert.equal((out.match(/<\/script>/g) || []).length, 1, "само затварящият таг на самия блок");
  assert.doesNotThrow(() => assertPublishable(out));
});

test("реалният билд: 3D маскотът е вграден, относителният import() го няма", () => {
  const { html } = build();
  if (!readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8").includes('import("./mascot3d.js")')) return;
  assert.ok(!html.includes('import("./mascot3d.js")'), "относителен път = блокиран от CSP");
  assert.ok(html.includes("loadMascot3D()") && html.includes("window.__MASCOT3D__"));
  assert.ok(html.indexOf('type="importmap"') < html.indexOf("const MASCOT3D_SRC"), "importmap преди модула");
});

test("mascotDataUris: 3D кадърът (.webp) има предимство пред SVG иконата", () => {
  const dir = mkdtempSync(join(tmpdir(), "m3d-"));
  writeFileSync(join(dir, "a-icon.svg"), '<svg viewBox="0 0 8 8"/>');
  writeFileSync(join(dir, "b-icon.svg"), '<svg viewBox="0 0 8 8"/>');
  writeFileSync(join(dir, "b-icon3d.webp"), Buffer.from([82, 73, 70, 70]));
  const icons = mascotDataUris(dir);
  assert.match(icons.a, /^data:image\/svg\+xml,/, "без кадър → SVG");
  assert.equal(icons.b, "data:image/webp;base64,UklGRg==", "с кадър → webp");
});

// Собственика, 2026-09-25: „върнал си стария маскот“ — когато живият 3D не тръгне, резервът е 3D кадър.
test("mascotPortraitUris: само `-portrait3d.webp`, като base64 webp", () => {
  const dir = mkdtempSync(join(tmpdir(), "m3p-"));
  writeFileSync(join(dir, "a-portrait3d.webp"), Buffer.from([82, 73, 70, 70]));
  writeFileSync(join(dir, "a-icon3d.webp"), Buffer.from([0]));
  assert.deepEqual(mascotPortraitUris(dir), { a: "data:image/webp;base64,UklGRg==" });
});

test("реалният билд: 3D портретите са вградени, относителният път към тях го няма", () => {
  const { html } = build();
  if (!readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8").includes("-portrait3d.webp`")) return;
  assert.ok(!html.includes("-portrait3d.webp`"), "относителен път = блокиран от CSP");
  assert.ok(html.includes("MASCOT_PORTRAITS[agent.id]"), "профилът чете вградената карта");
  const m = /const MASCOT_PORTRAITS = (\{.*?\});/.exec(html);
  assert.ok(m && Object.keys(JSON.parse(m[1])).length === 28, "портрет за всеки от 28-те агента");
});
