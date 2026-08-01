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
import { retint, rgb2hsl, themeFor, applyTheme, namespaceIds, BODY_TOKENS, hueSpread, inlineBlock, withInlineBlock, INLINE_MARKERS } from "./mascot-theme.mjs";
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

test("всеки агент има маскот и в трите нива", () => {
  const missing = [];
  for (const a of agents()) {
    for (const f of [`${a.id}.svg`, `${a.id}-icon.svg`, `${a.id}-animated.svg`]) {
      if (!existsSync(join(DIR, f))) missing.push(f);
    }
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

// ── тонът се разлива ─────────────────────────────────────────────────────────────────────────
// Един тон на петте спирки прави 28 плоски мармаладчета. Освен това ИЗХВЪРЛЯ информация: самата
// рампа на маскота върви от 111° в сянката до 83° в светлината. Долните тестове пазят разлива
// да съществува, да е в правилната ПОСОКА и да не разкъса героя на два несвързани цвята.

test("рампата на маскота САМА не е едноцветна — това е причината разливът да съществува", () => {
  const base = { ...tokens.sampled, ...tokens.extended };
  const h = (k) => rgb2hsl(...hex2rgb01(base[k].hex))[0];
  assert.ok(Math.abs(h("deep") - h("pale")) > 20,
    `източникът трябва да носи разлив, иначе правилото е измислено: ${h("deep")}° → ${h("pale")}°`);
  // Посоката е физическата: осветените тънки части се топлят (към ~40°), сянката изстива.
  assert.ok(h("pale") < h("deep"), "рампата трябва да се движи КЪМ топлото нагоре по светлотата");
});

test("всеки акцент получава реален разлив — включително вече топлите", () => {
  for (const a of agents()) {
    const s = Math.abs(hueSpread(a.accent));
    assert.ok(s >= 34 && s <= 90, `${a.id} (${a.accent}): разлив ${s}° извън [34, 90]`);
  }
  // Оранжевият акцент е капанът: той Е топлото, значи „завърти към топлото" дава нула.
  assert.ok(Math.abs(hueSpread("#f26322")) >= 34, "оранжев акцент НЕ бива да остане едноцветен");
});

test("телцето носи поне два тона, но остава ЕДНО тяло", () => {
  for (const a of agents()) {
    const v = themeFor(a.accent, tokens);
    const h = (k) => rgb2hsl(...hex2rgb01(v[`--jm-${k}`]))[0];
    const arc = (x, y) => Math.abs(((x - y + 540) % 360) - 180);
    assert.ok(arc(h("deep"), h("pale")) > 25, `${a.id}: разливът изчезна — телцето е плоско`);
    assert.ok(arc(h("deep"), h("pale")) < 110, `${a.id}: краищата се разпаднаха на два героя`);
  }
});

test("емисията свети: горните спирки вдигат светлота, обемните три я пазят", () => {
  const v = themeFor("#e11d48", tokens);
  const base = { ...tokens.sampled, ...tokens.extended };
  const L = (hex) => rgb2hsl(...hex2rgb01(hex))[2];
  for (const k of ["deep", "bottle", "neon"]) {
    assert.ok(Math.abs(L(base[k].hex) - L(v[`--jm-${k}`])) < 0.02,
      `${k} носи ОБЕМА — светлотата му трябва да е непокътната`);
  }
  for (const k of ["olive", "pale"]) {
    assert.ok(L(v[`--jm-${k}`]) > L(base[k].hex) + 0.02,
      `${k} пълни ядрото/подсветката/ореола — без вдигане няма светене отвътре`);
  }
});

test("сиянието НАВЪН е в таблото и следва акцента, не е зашито", () => {
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  const rule = html.match(/\.mascot svg \{([^}]*)\}/)[1];
  assert.match(rule, /drop-shadow/, "профилът трябва да носи сияние");
  assert.match(rule, /var\(--ac\)/, "сиянието трябва да е в цвета на АГЕНТА, не фиксирано");
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

// ── вграденият жив маскот в профила ──────────────────────────────────────────────────────────
// Профилът показва АНИМИРАНИЯ маскот вграден инлайн — само така курсорът може да води погледа.
// Долните проверки пазят точно това, което мерих в браузъра: тема, поглед, анимация, побиране.

test("вграденият блок носи анимацията и куката за погледа", () => {
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  const block = html.slice(html.indexOf(INLINE_MARKERS.MARK_START), html.indexOf(INLINE_MARKERS.MARK_END));
  assert.ok(block.includes("jm-pupils"), "без .jm-pupils погледът няма какво да мести");
  assert.ok(block.includes("--jm-gaze-x"), "анимираният вариант е този с гледащите зеници");
  assert.ok(/@keyframes|animation:/.test(block), "вграден е СТАТИЧНИЯТ маскот — профилът ще е замръзнал");
  assert.ok(block.includes("prefers-reduced-motion"), "пакетът трябва да носи и спирачката за движение");
});

test("темите за 28-те агента са в блока, а startMascot няма нито един цвят", () => {
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  const ctx = {
    tokens, sources: {}, agents: agents(),
  };
  // Само темите — геометрията идва от файла, тук сверяваме че всеки агент присъства.
  const themes = Object.fromEntries(ctx.agents.map((a) => [a.id, themeFor(a.accent, tokens)]));
  const m = html.match(/const MASCOT_THEMES = (\{.*?\});/s);
  assert.ok(m, "MASCOT_THEMES липсва във вградения блок");
  assert.deepEqual(JSON.parse(m[1]), themes, "темите в таблото се разминават с генератора");

  // Второ пресмятане на цвета в браузъра щеше да дрейфне от това в Node при първата поправка.
  const fn = html.slice(html.indexOf("function startMascot("));
  // Коментарите се махат ПРЕДИ проверката: първата ми версия падна върху „PR #162" в коментар —
  // детектор, който чете проза вместо код, е същата грешка, която ловим на трето място в тази сесия.
  const body = fn.slice(0, fn.indexOf("\n}\n") + 2).replace(/\/\/[^\n]*/g, "");
  assert.ok(!/#[0-9A-Fa-f]{3,8}\b/.test(body), `startMascot не бива да носи цвят: ${body.match(/#[0-9A-Fa-f]{3,8}/)}`);
});

test("SVG-то се побира в кутията — иначе от героя се вижда само шапката", () => {
  // Реален дефект, хванат в браузъра: `.mascot` е висока 232px, а SVG-то носи width/height=512,
  // затова преливаше и профилът показваше само академичната шапка.
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  const rule = html.match(/\.mascot svg \{([^}]*)\}/);
  assert.ok(rule, "липсва правило за размера на вградения маскот");
  assert.match(rule[1], /height:\s*100%/, "височината трябва да води (кутията е фиксирана)");
  assert.match(rule[1], /width:\s*auto/, "ширината следва, за да не се сплеска героят");
});

test("погледът се откача при затваряне — иначе всяко отваряне трупа слушател", () => {
  const html = readFileSync(join(ROOT, "agents-dashboard", "index.html"), "utf8");
  assert.match(html, /function stopMascot\(\)[^\n]*mascotCleanup\(\)/, "stopMascot трябва да вика чистача");
  assert.match(html, /mascotCleanup = \(\) => window\.removeEventListener\("mousemove"/);
});

test("--check ПАДА, когато вграденият блок в таблото застоява", () => {
  const html = join(ROOT, "agents-dashboard", "index.html");
  // Мутираме темата на агент — точно това, което се разсинхронизира при смяна на акцент.
  const status = withMutation(html, replaceOnce("const MASCOT_THEMES = {", 'const MASCOT_THEMES = {"_":{},'), () =>
    spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" }).status);
  assert.equal(status, 1, "застоял вграден маскот трябва да вдигне гейта");
});

test("inlineBlock е чиста функция — един и същ вход дава един и същ изход (гейтът иска стабилност)", () => {
  const src = readFileSync(join(ROOT, "mascot", "svg", "jelly-mascot-full-animated.svg"), "utf8");
  const ctx = { tokens, sources: { animated: src }, agents: agents() };
  assert.equal(inlineBlock(ctx), inlineBlock(ctx));
  const html = `x\n${INLINE_MARKERS.MARK_START}\nстаро\n${INLINE_MARKERS.MARK_END}\ny`;
  assert.ok(withInlineBlock(html, inlineBlock(ctx)).startsWith("x\n"));
  assert.ok(withInlineBlock(html, inlineBlock(ctx)).endsWith("y"));
  assert.equal(withInlineBlock("без маркери", "нов"), "без маркери", "без маркери не пипаме файла");
});

test("проверката е в състава на гейта и е задължителна", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  assert.match(gate, /mascot-theme\.mjs/);
  const rec = gate.slice(gate.indexOf('id: "mascots"'));
  assert.ok(!/required:\s*false/.test(rec.slice(0, rec.indexOf("}"))));
});
