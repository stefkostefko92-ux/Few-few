#!/usr/bin/env node
// Тестове на гейта и на генератора (node:test, нула зависимости):
//   node --test mascot/
//
// Тестваме чистите функции с фикстури (за да знаем, че гейтът наистина ЛОВИ, а не просто е зелен)
// плюс един интеграционен тест върху реалните файлове.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { jsxAttrName, jsxAttrValue, svgBodyToJsx, animationCss, animatedSvg, socialCard, generate, generateAnimatedSvg, generateSocialCard } from "./build.mjs";
import { hexes, paletteOf, wellFormed, bearingCircles, audit, FORBIDDEN } from "./check.mjs";
import { groupOf, partsOf, compose, moduleNames, FACE_PARTS } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(join(HERE, p), "utf8");

test("jsxAttrName: kebab → camel, но a11y/namespace остават", () => {
  assert.equal(jsxAttrName("stroke-width"), "strokeWidth");
  assert.equal(jsxAttrName("stop-color"), "stopColor");
  assert.equal(jsxAttrName("class"), "className");
  assert.equal(jsxAttrName("aria-labelledby"), "aria-labelledby");
  assert.equal(jsxAttrName("xmlns"), "xmlns");
});

test("jsxAttrValue: id-та и препратки получават уникален префикс", () => {
  assert.equal(jsxAttrValue("id", "jm-body"), "{`${uid}-body`}");
  assert.equal(jsxAttrValue("fill", "url(#jm-core)"), "{`url(#${uid}-core)`}");
  assert.equal(jsxAttrValue("fill", "url(#jmm-core)"), "{`url(#${uid}-core)`}");
  assert.equal(jsxAttrValue("aria-labelledby", "jm-title jm-desc"), "{`${uid}-title ${uid}-desc`}");
  // Стойност без id си остава обикновен низ — без излишни template literal-и.
  assert.equal(jsxAttrValue("fill", "var(--jm-neon, #5AB60D)"), '"var(--jm-neon, #5AB60D)"');
});

test("svgBodyToJsx: маха title/desc, превежда коментарите и атрибутите", () => {
  const out = svgBodyToJsx('<svg viewBox="0 0 1 1"><title id="jm-title">х</title><desc>у</desc>\n  <!-- бележка -->\n  <g class="jm-body"><path d="M0 0" stroke-width="2"/></g>\n</svg>', "");
  assert.match(out, /\{\/\* бележка \*\/\}/);
  assert.match(out, /className="jm-body"/);
  assert.match(out, /strokeWidth="2"/);
  assert.doesNotMatch(out, /<title|<desc/);
});

test("svgBodyToJsx: отказва вход, който би счупил JSX", () => {
  assert.throws(() => svgBodyToJsx('<svg><path d="M0 0 {x}"/></svg>'), /JSX-опасен/);
  assert.throws(() => svgBodyToJsx("<svg><!-- */ --></svg>"), /JSX коментар/);
});

test("animationCss: изисква маркерите", () => {
  assert.throws(() => animationCss(".a { color: red }"), /@animation:start/);
  assert.match(animationCss("/* @animation:start x */\n.jm-animated .jm-root { opacity: 1 }\n/* @animation:end */"), /jm-root/);
});

test("hexes/paletteOf: нормализират регистъра", () => {
  assert.deepEqual(hexes('fill="#5ab60d" stroke="#C8DDA6"'), ["#5AB60D", "#C8DDA6"]);
  const palette = paletteOf({ sampled: { neon: { hex: "#5ab60d" } }, extended: { $note: "…", ink: { hex: "#0A0C0A" } } });
  assert.ok(palette.has("#5AB60D") && palette.has("#0A0C0A") && palette.size === 2);
});

test("wellFormed: лови счупен SVG, пуска валидния", () => {
  assert.equal(wellFormed('<svg><g><path d="M0 0"/></g></svg>'), null);
  assert.match(wellFormed("<svg><g></svg>"), /неочакван затварящ таг/);
  assert.match(wellFormed("<svg><g></g>"), /незатворен таг/);
  assert.match(wellFormed('<svg><path d="M0 0"></path></svg>'), /самозатварящ/);
});

test("groupOf/bearingCircles: вадят носещата геометрия на частта", () => {
  const svg = '<svg><g class="jm-eyes"><circle cx="1" cy="2" r="34"/><circle cx="3" cy="4" r="8"/></g><g class="x"/></svg>';
  assert.match(groupOf(svg, "jm-eyes"), /r="34"/);
  assert.equal(groupOf(svg, "jm-nope"), null);
  assert.deepEqual(bearingCircles(groupOf(svg, "jm-eyes"), 20), ["1,2,34"]);
});

test("audit: реалните файлове минават гейта", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  assert.deepEqual(audit({ svgs, tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate() }), []);
});

test("audit: лови цвят извън палитрата, ръчно пипнат компонент и тънка линия в иконата", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const dirty = {
    ...svgs,
    "jelly-mascot-icon.svg": svgs["jelly-mascot-icon.svg"]
      .replace('stroke-width="20"', 'stroke-width="3"')
      .replace("var(--jm-neon, #5AB60D)", "#FF00FF"),
  };
  const fail = audit({ svgs: dirty, tsx: "// ръчно пипнат", tokens: R("tokens.json"), generated: generate() });
  assert.ok(fail.some((f) => /#FF00FF/.test(f)), "цвят извън палитрата не е хванат");
  assert.ok(fail.some((f) => /stroke-width="3"/.test(f)), "тънката линия в иконата не е хваната");
  assert.ok(fail.some((f) => /build\.mjs/.test(f)), "разминаването на генерирания компонент не е хванато");
});

test("audit: лови разминаване между мострите във витрината и палитрата", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const base = { svgs, tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate() };
  assert.deepEqual(audit({ ...base, demo: R("demo/index.html") }), []);
  const drifted = R("demo/index.html").replace("background:#5AB60D", "background:#5AB60E");
  assert.ok(audit({ ...base, demo: drifted }).some((f) => /мострите/.test(f)));
});

test("audit: лови скрипт/събитиен атрибут/външна препратка в асета", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const base = { tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate() };
  for (const bad of ['<script>x()</script>', '<g onclick="x()"/>', '<image href="https://зло.example/x.png"/>', "<foreignObject/>"]) {
    const poisoned = { ...svgs, "jelly-mascot-full.svg": svgs["jelly-mascot-full.svg"].replace("</svg>", `${bad}</svg>`) };
    assert.ok(audit({ ...base, svgs: poisoned }).some((f) => /чист рисунък/.test(f)), `не е хванато: ${bad}`);
  }
  // `aria-labelledby` не е препратка — правилото не бива да го бърка с href.
  assert.ok(!FORBIDDEN.some(([re]) => re.test('<svg aria-labelledby="jm-title">')));
});

test("animatedSvg: вгражда стиловете и маркира корена", () => {
  const out = animatedSvg('<svg viewBox="0 0 1 1">\n  <title>х</title>\n  <defs></defs>\n</svg>', ".jm-animated .jm-root { opacity: 1 }");
  assert.match(out, /^<svg class="jm-animated"/);
  assert.match(out, /<style>[\s\S]*jm-root[\s\S]*<\/style>/);
  assert.throws(() => animatedSvg("<svg></svg>", "x"), /няма <defs>/);
});

test("audit: лови ръчно пипнат анимиран SVG", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const base = { tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate(), generatedAnimated: generateAnimatedSvg() };
  assert.deepEqual(audit({ ...base, svgs }), []);
  const tampered = { ...svgs, "jelly-mascot-full-animated.svg": svgs["jelly-mascot-full-animated.svg"].replace("jm-bob 3.6s", "jm-bob 0.2s") };
  assert.ok(audit({ ...base, svgs: tampered }).some((f) => /full-animated/.test(f)));
});

test("socialCard: вгражда пълното ниво в кадър 1200×630 със свое достъпно име", () => {
  const card = socialCard('<svg viewBox="0 0 512 512">\n  <title id="jm-title">х</title>\n  <desc>у</desc>\n  <g class="jm-body"/>\n</svg>');
  assert.match(card, /viewBox="0 0 1200 630"/);
  assert.match(card, /jm-card-title/);
  assert.doesNotMatch(card, /<title id="jm-title">/);
  assert.match(card, /class="jm-body"/);
});

test("audit: лови разминат силует между вариантите", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const base = { tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate(), generatedAnimated: generateAnimatedSvg(), generatedCard: generateSocialCard() };
  assert.deepEqual(audit({ ...base, svgs }), []);
  const drifted = { ...svgs, "jelly-mascot-icon.svg": svgs["jelly-mascot-icon.svg"].replace(/class="jm-body" d="[^"]+"/, 'class="jm-body" d="M0 0H1V1H0Z"') };
  assert.ok(audit({ ...base, svgs: drifted }).some((f) => /силуетът се разминава/.test(f)));
});

test("audit: лови ръчно пипната социална карта", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const base = { tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate(), generatedAnimated: generateAnimatedSvg(), generatedCard: generateSocialCard() };
  const tampered = { ...svgs, "social-card.svg": svgs["social-card.svg"].replace('width="1200"', 'width="1201"') };
  assert.ok(audit({ ...base, svgs: tampered }).some((f) => /social-card/.test(f)));
});

test("groupOf/partsOf/compose: сменят части, без да пипат останалото", () => {
  const base = '<svg>\n  <g class="jm-eyes"><circle r="1"/></g>\n  <g class="jm-mouth"><path d="A"/></g>\n</svg>';
  assert.match(groupOf(base, "jm-eyes"), /circle/);
  assert.equal(groupOf(base, "jm-nope"), null);
  const out = compose(base, { "jm-eyes": '<g class="jm-eyes"><rect/></g>' });
  assert.match(out, /<rect\/>/);
  assert.match(out, /class="jm-mouth"/);
  assert.doesNotMatch(out, /circle/);
  assert.throws(() => partsOf("<svg/>", FACE_PARTS), /няма група/);
});

test("compose: пренасочва градиента към префикса на нивото", () => {
  const out = compose('<svg><g class="jm-arms"/></svg>'.replace("/>", "></g>"), { "jm-arms": '<g class="jm-arms" stroke="url(#jm-body)"/>' }, "jmm");
  assert.match(out, /url\(#jmm-body\)/);
});

test("audit: лови непълен модул на лицето и url(#…) в него", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const tokens = R("tokens.json");
  const broken = audit({
    svgs,
    tsx: R("react/JellyMascot.tsx"),
    tokens,
    generated: generate(),
    modules: { faces: { broken: '<svg><g class="jm-brows"/><g class="jm-eyes" fill="url(#jm-core)"/></svg>' }, poses: {} },
  });
  assert.ok(broken.some((f) => /липсва групата „jm-mouth"/.test(f)));
  assert.ok(broken.some((f) => /url\(#…\)/.test(f)));
});

test("audit: лови ръчно пипнат вариант (изражение/поза)", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const fail = audit({
    svgs: { ...svgs, "expressions/happy.svg": "<svg/>" },
    tsx: R("react/JellyMascot.tsx"),
    tokens: R("tokens.json"),
    generated: generate(),
    generatedVariants: { "svg/expressions/happy.svg": "<svg>друго</svg>" },
  });
  assert.ok(fail.some((f) => /expressions\/happy\.svg се разминава/.test(f)));
});

test("модулите на лицето са пълни и без препратки", () => {
  for (const name of moduleNames("faces")) {
    const svg = R(`faces/${name}.svg`);
    assert.deepEqual(Object.keys(partsOf(svg, FACE_PARTS)), FACE_PARTS, `${name}: непълен модул`);
    assert.doesNotMatch(svg, /url\(#/, `${name}: препратка към градиент в модул на лицето`);
  }
});

test("audit: лови липсваща достъпност", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const noTitle = { ...svgs, "jelly-mascot-full.svg": svgs["jelly-mascot-full.svg"].replace(/<title[\s\S]*?<\/title>/, "") };
  const fail = audit({ svgs: noTitle, tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate() });
  assert.ok(fail.some((f) => /<title>/.test(f)));
  assert.ok(fail.some((f) => /несъществуващ id/.test(f)));
});
