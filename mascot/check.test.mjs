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

import { jsxAttrName, jsxAttrValue, svgBodyToJsx, animationCss, generate } from "./build.mjs";
import { hexes, paletteOf, wellFormed, groupOf, bearingCircles, audit, FORBIDDEN } from "./check.mjs";

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

test("audit: лови липсваща достъпност", () => {
  const svgs = Object.fromEntries(readdirSync(join(HERE, "svg")).filter((f) => f.endsWith(".svg")).map((f) => [f, R(`svg/${f}`)]));
  const noTitle = { ...svgs, "jelly-mascot-full.svg": svgs["jelly-mascot-full.svg"].replace(/<title[\s\S]*?<\/title>/, "") };
  const fail = audit({ svgs: noTitle, tsx: R("react/JellyMascot.tsx"), tokens: R("tokens.json"), generated: generate() });
  assert.ok(fail.some((f) => /<title>/.test(f)));
  assert.ok(fail.some((f) => /несъществуващ id/.test(f)));
});
