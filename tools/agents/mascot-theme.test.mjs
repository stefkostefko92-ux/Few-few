// mascot-theme.test.mjs — маскотът е ЕДИН герой в 28 цвята, а не 28 различни героя.
//
// Рискът: формата се поправя в `mascot/`, но пребоядисаните копия остават стари — таблото показва
// вчерашния маскот и никой не забелязва, защото и старият „изглежда добре". Затова гейтваме
// съответствието, а не външния вид.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retint, rgb2hsl, themeFor, applyTheme, namespaceIds, BODY_TOKENS } from "./mascot-theme.mjs";
import { withMutation, replaceOnce } from "../lib/mutation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "agents-dashboard", "mascots");
const TOOL = join(ROOT, "tools", "agents", "mascot-theme.mjs");
const tokens = JSON.parse(readFileSync(join(ROOT, "mascot", "tokens.json"), "utf8"));
const agents = () => {
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  return reg.agents || reg;
};
const hex2rgb01 = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };

test("всеки агент има маскот в двете нива", () => {
  const missing = [];
  for (const a of agents()) {
    if (!existsSync(join(DIR, `${a.id}.svg`))) missing.push(`${a.id}.svg`);
    if (!existsSync(join(DIR, `${a.id}-icon.svg`))) missing.push(`${a.id}-icon.svg`);
  }
  assert.deepEqual(missing, []);
});

test("пребоядисването пази СВЕТЛОТАТА (тя носи обема), сменя тона", () => {
  const ramp = "#5AB60D";           // neon от палитрата на маскота
  const out = retint(ramp, "#e11d48"); // акцентът на Разбивача
  const [, , lRamp] = rgb2hsl(...hex2rgb01(ramp));
  const [hOut, , lOut] = rgb2hsl(...hex2rgb01(out));
  assert.ok(Math.abs(lRamp - lOut) < 0.02, `светлотата трябва да се запази: ${lRamp} → ${lOut}`);
  const [hAcc] = rgb2hsl(...hex2rgb01("#e11d48"));
  assert.ok(Math.abs(hOut - hAcc) < 1, `тонът трябва да е на агента: ${hAcc} → ${hOut}`);
});

test("пребоядисва се само ТЯЛОТО — аксесоарите остават на героя", () => {
  const vars = themeFor("#e11d48", tokens);
  for (const k of BODY_TOKENS) assert.ok(vars[`--jm-${k}`], `${k} трябва да е пребоядисан`);
  for (const k of ["ink", "gold", "eye", "white", "mask-black"]) {
    assert.equal(vars[`--jm-${k}`], undefined, `${k} НЕ бива да се пипа — това е героят, не агентът`);
  }
});

test("applyTheme сменя падащата стойност, а НЕ маха var() (файлът работи и като <img>)", () => {
  const out = applyTheme('fill="var(--jm-neon, #5AB60D)"', { "--jm-neon": "#ff0000" });
  assert.equal(out, 'fill="var(--jm-neon, #ff0000)"');
});

test("id-тата са уникални per агент — иначе всички ползват градиента на първия", () => {
  // Реален дефект, хванат при пробата: 8 маскота на страница се рисуваха с цвета на първия.
  const a = agents()[0], b = agents()[1];
  const sa = readFileSync(join(DIR, `${a.id}.svg`), "utf8");
  const sb = readFileSync(join(DIR, `${b.id}.svg`), "utf8");
  const ids = (s) => new Set([...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const [ia, ib] = [ids(sa), ids(sb)];
  assert.ok(ia.size > 3, "очаквам реални id-та в SVG-то");
  assert.equal([...ia].filter((x) => ib.has(x)).length, 0, "нула споделени id-та между два маскота");
  assert.ok([...ia].every((x) => x.startsWith(a.id)), "всяко id носи префикса на агента");
});

test("всяка препратка url(#…) сочи id, което съществува в СЪЩИЯ файл", () => {
  for (const a of agents()) {
    const s = readFileSync(join(DIR, `${a.id}.svg`), "utf8");
    const ids = new Set([...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...s.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    const dangling = refs.filter((r) => !ids.has(r));
    assert.deepEqual(dangling, [], `${a.id}: висящи препратки (празен кадър в браузъра, без грешка)`);
  }
});

test("достъпност: името на АГЕНТА е в <title>, не общото име на маскота", () => {
  for (const a of agents()) {
    const s = readFileSync(join(DIR, `${a.id}.svg`), "utf8");
    assert.match(s, /role="img"/, `${a.id}: липсва role`);
    assert.ok(s.includes(`<title>${a.name}`), `${a.id}: <title> трябва да носи името на агента`);
  }
});

test("нула външни ресурси (CSP на артефактите, офлайн табло)", () => {
  for (const a of agents()) {
    const s = readFileSync(join(DIR, `${a.id}-icon.svg`), "utf8");
    assert.ok(!/(href|src)="https?:/.test(s), `${a.id}: външен ресурс`);
  }
});

test("--check ПАДА, когато маскотът в mascot/ се смени (доказано с мутация)", () => {
  const src = join(ROOT, "mascot", "svg", "jelly-mascot-icon.svg");
  // Мутацията трябва да удари част, която ОЦЕЛЯВА в изхода. Първият ми опит смени `<title>` —
  // но точно него инструментът пренаписва с името на агента, затова нямаше ефект и тестът
  // „минаваше" без да е доказал нищо. Геометрията оцелява.
  const status = withMutation(src, replaceOnce("<path", '<path data-proba="1"'), () =>
    spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" }).status);
  assert.equal(status, 1, "сменен изходен маскот при стари копия трябва да вдигне гейта");
  assert.equal(spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" }).status, 0,
    "след възстановяване гейтът пак е зелен");
});

test("таблото ползва маскота като облик на агента", () => {
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  assert.match(html, /mascots\/\$\{encodeURIComponent\(id\)\}-icon\.svg/, "iconSVG трябва да сочи маскота");
  assert.match(html, /function iconFallback/, "резервният линеен вариант остава, ако папката липсва");
});

test("проверката е в състава на гейта и е задължителна", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  assert.match(gate, /mascot-theme\.mjs/);
  const rec = gate.slice(gate.indexOf('id: "mascots"'));
  assert.ok(!/required:\s*false/.test(rec.slice(0, rec.indexOf("}"))));
});
