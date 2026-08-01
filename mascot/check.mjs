#!/usr/bin/env node
// check.mjs — гейтът на пакета (нула зависимости).
//
// Статичен SVG няма как да „падне" по време на изпълнение — затова единственият начин дефект да
// стигне до продукт е тихо разминаване. Проверяваме точно разминаванията:
//   1) компонентът е генериран от текущите SVG-та (regenerate-and-diff);
//   2) нито един цвят извън `tokens.json` (палитрата е закон, не пожелание);
//   3) всеки SVG е валидно затворен (счупен таг = празен кадър в браузъра, без грешка);
//   4) правилата за консистентност от дизайн-брифа: еднакви очи/очила между нивата, никакви
//      филтри в „medium"/„icon", никакви мехурчета в „icon", дебели щрихи в „icon";
//   5) достъпност: role="img" + <title>, свързан през aria-labelledby;
//   6) мострите във витрината съвпадат със снетата палитра;
//   7) сигурност: нула скриптове, събитийни атрибути и външни препратки в асета.
//
//   node check.mjs            # гейт (exit 1 при пропуск)
//   node check.mjs --json     # машинен изход

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, generateAnimatedSvg, generateSocialCard, generateVariants, groupOf, partsOf, moduleNames, FACE_PARTS, POSE_PARTS, TIERS } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(join(HERE, p), "utf8");

/** Тагове без затварящ партньор в SVG. */
const VOID_TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "polyline", "stop", "use", "image", "feGaussianBlur", "feColorMatrix", "feBlend", "feOffset"]);

/** Забранено в бранд асет — всяко от тях превръща картинката в изпълним/мрежов елемент. */
export const FORBIDDEN = [
  [/<script\b/i, "съдържа <script>"],
  [/<foreignObject\b/i, "съдържа <foreignObject>"],
  [/\son[a-z]+\s*=/i, "съдържа inline събитиен атрибут (on…=)"],
  [/xlink:href|(?<!aria-labelled)(?<![-\w])href\s*=/i, "съдържа външна препратка (href/xlink:href)"],
  [/url\(\s*['"]?https?:/i, "сочи външен ресурс по мрежата"],
  [/@import/i, "съдържа @import"],
];

/** Всички HEX цветове в текст, нормализирани към главни букви. */
export function hexes(text) {
  return [...String(text).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toUpperCase());
}

/** Позволените цветове от tokens.json (sampled + extended). */
export function paletteOf(tokensJson) {
  const t = typeof tokensJson === "string" ? JSON.parse(tokensJson) : tokensJson;
  const out = new Set();
  for (const group of [t.sampled, t.extended]) {
    for (const [k, v] of Object.entries(group)) if (k !== "$note") out.add(String(v.hex).toUpperCase());
  }
  return out;
}

/**
 * Балансирани тагове. Не е пълен XML парсер (нямаме зависимости и не ни трябва) — лови точно
 * това, което реално се чупи при ръчна редакция: незатворен или разменен таг.
 */
export function wellFormed(svg) {
  const text = String(svg).replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[:\w-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g)) {
    const [, closing, tag, , selfClose] = m;
    if (closing) {
      if (stack.pop() !== tag) return `неочакван затварящ таг </${tag}>`;
    } else if (!selfClose) {
      if (VOID_TAGS.has(tag)) return `<${tag}> трябва да е самозатварящ се (<${tag} …/>)`;
      stack.push(tag);
    }
  }
  return stack.length ? `незатворен таг <${stack[stack.length - 1]}>` : null;
}

/** Носещите кръгове на дадена част (радиус ≥ minR) като „cx,cy,r" — без цвят и без непрозрачност. */
export function bearingCircles(fragment, minR) {
  return [...String(fragment).matchAll(/<circle((?:\s+[:\w-]+\s*=\s*"[^"]*")*)/g)]
    .map(([, attrs]) => Object.fromEntries([...attrs.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)].map(([, n, v]) => [n, v])))
    .filter((a) => Number(a.r) >= minR)
    .map((a) => `${a.cx},${a.cy},${a.r}`);
}

/** Всички проверки върху вече прочетените файлове. Чиста функция — тества се без диск. */
export function audit({ svgs, tsx, tokens, generated, generatedAnimated, generatedCard, generatedVariants, modules, demo }) {
  const fail = [];
  const palette = paletteOf(tokens);

  if (generatedAnimated && svgs["jelly-mascot-full-animated.svg"] !== generatedAnimated) {
    fail.push("svg/jelly-mascot-full-animated.svg се разминава с генерирания (пълно ниво + анимацията от tokens.css) — пусни `node build.mjs`");
  }

  for (const [rel, expected] of Object.entries(generatedVariants || {})) {
    const key = rel.replace(/^svg\//, "");
    if (svgs[key] !== expected) fail.push(`svg/${key} се разминава с генерирания от модула — пусни \`node build.mjs\``);
  }

  // Модулите на лицето/позата: пълен комплект части и НУЛА препратки към градиенти в лицето
  // (компонентът подава изражението без `uid`; `url(#…)` там би сочило в празното).
  for (const [name, text] of Object.entries(modules?.faces || {})) {
    for (const part of FACE_PARTS) {
      if (!groupOf(text, part)) fail.push(`faces/${name}.svg: липсва групата „${part}" — изражението е непълно`);
    }
    if (!groupOf(text, "jm-pupils")) fail.push(`faces/${name}.svg: липсва „jm-pupils" — погледът (idle + следене на курсора) мърда точно тази група и без нея изражението остава вкаменено`);
    if (/url\(#/.test(text)) fail.push(`faces/${name}.svg: съдържа url(#…) — модулите на лицето нямат уникални id-та и препратката ще сочи в празното`);
    for (const hex of new Set(hexes(text))) {
      if (!paletteOf(tokens).has(hex)) fail.push(`faces/${name}.svg: цвят ${hex} липсва в tokens.json`);
    }
  }
  for (const [name, text] of Object.entries(modules?.poses || {})) {
    for (const part of POSE_PARTS) {
      if (!groupOf(text, part)) fail.push(`poses/${name}.svg: липсва групата „${part}"`);
    }
    for (const hex of new Set(hexes(text))) {
      if (!paletteOf(tokens).has(hex)) fail.push(`poses/${name}.svg: цвят ${hex} липсва в tokens.json`);
    }
  }

  if (generatedCard && svgs["social-card.svg"] !== generatedCard) {
    fail.push("svg/social-card.svg се разминава с генерираната от пълното ниво — пусни `node build.mjs`");
  }

  if (generated !== tsx) {
    fail.push("react/JellyMascot.tsx се разминава с генерирания от svg/*.svg + tokens.css — пусни `node build.mjs` (файлът е генериран, не се редактира на ръка)");
  }

  for (const [name, text] of Object.entries(svgs)) {
    const broken = wellFormed(text);
    if (broken) fail.push(`${name}: ${broken}`);

    for (const hex of new Set(hexes(text))) {
      if (!palette.has(hex)) fail.push(`${name}: цвят ${hex} липсва в tokens.json (палитрата е единственият източник)`);
    }

    if (!/role="img"/.test(text)) fail.push(`${name}: липсва role="img"`);
    const labelled = text.match(/aria-labelledby="([^"]+)"/);
    if (!labelled) fail.push(`${name}: липсва aria-labelledby`);
    else for (const id of labelled[1].split(/\s+/)) {
      if (!new RegExp(`id="${id}"`).test(text)) fail.push(`${name}: aria-labelledby сочи несъществуващ id „${id}"`);
    }
    if (!/<title\b/.test(text)) fail.push(`${name}: липсва <title> (достъпното име на маскота)`);

    // Сигурност (SECURITY.md): вграден SVG изпълнява скриптове в контекста на страницата.
    // (`<style>` НЕ е в списъка — единственият стил тук е нашият генериран анимационен блок,
    // който `check.mjs` сверява байт по байт срещу `tokens.css` няколко реда по-горе.)
    // Затова асетите са чист рисунък — гейтваме го, вместо да го обещаваме в документ.
    for (const [re, why] of FORBIDDEN) {
      if (re.test(text)) fail.push(`${name}: ${why} — асетът трябва да е чист рисунък (виж SECURITY.md)`);
    }

    if (/class="jm-eyes"/.test(text) && !/class="jm-pupils"/.test(text) && !name.startsWith("jelly-mascot-icon") && !name.startsWith("jelly-mascot-mono")) {
      fail.push(`${name}: очите нямат „jm-pupils" — погледът няма какво да движи`);
    }

    for (const cls of ["jm-body", "jm-eyes", "jm-glasses", "jm-bowtie", "jm-cap"]) {
      if (!text.includes(`class="${cls}"`)) fail.push(`${name}: липсва задължителната част „${cls}" (правило за консистентност — маскотът е един и същ на всяко ниво)`);
    }
  }

  for (const hex of new Set(hexes(tsx))) {
    if (!palette.has(hex)) fail.push(`react/JellyMascot.tsx: цвят ${hex} липсва в tokens.json`);
  }

  // Правило от брифа: „не променяй размера на очите между кадрите." Сравняваме НОСЕЩАТА геометрия
  // (едрите кръгове: бяло на окото, зеница, рамка), не декорацията — блясъците и тонираното
  // стъкло имат право да отпадат при по-ниския детайл. Иконата е умишлено различна (уголемена
  // за 16 px) и не участва в сравнението.
  for (const [part, minR] of [["jm-eyes", 20], ["jm-glasses", 40]]) {
    const key = (svg) => JSON.stringify([...new Set(bearingCircles(groupOf(svg, part) ?? "", minR))].sort());
    if (key(svgs["jelly-mascot-full.svg"]) !== key(svgs["jelly-mascot-medium.svg"])) {
      fail.push(`„${part}" се разминава между full и medium — размерът и мястото на очите/очилата са фиксирани от дизайн-брифа`);
    }
  }

  // Витрината преписва палитрата на ръка (визуални мостри) — гейтваме, че преписът съвпада,
  // иначе демонстрацията тихо започва да лъже за бранда.
  if (demo) {
    const block = demo.match(/<div class="swatches[^"]*">([\s\S]*?)\n<\/div>/);
    if (!block) fail.push("demo/index.html: липсва секцията с мострите на палитрата");
    else {
      const shown = [...new Set(hexes(block[1]))].sort();
      const sampled = [...new Set(Object.entries(JSON.parse(tokens).sampled).map(([, v]) => v.hex.toUpperCase()))].sort();
      if (JSON.stringify(shown) !== JSON.stringify(sampled)) {
        fail.push(`demo/index.html: мострите (${shown.join(", ")}) се разминават със снетата палитра в tokens.json (${sampled.join(", ")})`);
      }
    }
  }

  // Един силует за всички варианти. Иконата и едноцветният знак имат право да опростяват ВСИЧКО
  // друго, но не и очертанието — то е първото, по което се разпознава маскот.
  const bodies = new Map();
  for (const [name, text] of Object.entries(svgs)) {
    const m = text.match(/class="jm-body"[^>]*\sd="([^"]+)"/);
    if (m) bodies.set(name, m[1]);
  }
  const canonical = bodies.get("jelly-mascot-full.svg");
  for (const [name, d] of bodies) {
    if (canonical && d !== canonical) fail.push(`${name}: силуетът се разминава с пълното ниво — маскотът е един, не роднини`);
  }

  // „Medium" трябва да оцелява във векторни конвейери, „icon" — при 16 px.
  const medium = svgs["jelly-mascot-medium.svg"];
  const icon = svgs["jelly-mascot-icon.svg"];
  if (/<filter\b/.test(medium)) fail.push("medium: съдържа <filter> — блурът не оцелява при векторизация/печат");
  if (/<filter\b/.test(icon)) fail.push("icon: съдържа <filter>");
  if (/<(radial|linear)Gradient\b/.test(icon)) fail.push("icon: съдържа градиент — иконното ниво е с плътни цветове");
  if (/class="jm-bubbles"/.test(icon)) fail.push("icon: съдържа мехурчета — под 24 px те стават мръсотия");
  for (const [, w] of icon.matchAll(/stroke-width="([\d.]+)"/g)) {
    if (Number(w) < 12) fail.push(`icon: stroke-width="${w}" е под 12 — при 16 px линията изчезва`);
  }

  return fail;
}

/** Всички SVG-та в `svg/` (включително `expressions/` и `poses/`), с ключ спрямо `svg/`. */
function allSvgs() {
  const out = {};
  for (const entry of readdirSync(join(HERE, "svg"), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of readdirSync(join(HERE, "svg", entry.name))) {
        if (f.endsWith(".svg")) out[`${entry.name}/${f}`] = R(`svg/${entry.name}/${f}`);
      }
    } else if (entry.name.endsWith(".svg")) out[entry.name] = R(`svg/${entry.name}`);
  }
  return out;
}

function main() {
  const svgs = allSvgs();
  for (const t of TIERS) {
    if (!svgs[`jelly-mascot-${t}.svg`]) {
      console.error(`✗ липсва svg/jelly-mascot-${t}.svg`);
      process.exit(1);
    }
  }

  const fail = audit({
    svgs,
    tsx: R("react/JellyMascot.tsx"),
    tokens: R("tokens.json"),
    generated: generate(),
    generatedAnimated: generateAnimatedSvg(),
    generatedCard: generateSocialCard(),
    generatedVariants: generateVariants(),
    modules: {
      faces: Object.fromEntries(moduleNames("faces").map((n) => [n, R(`faces/${n}.svg`)])),
      poses: Object.fromEntries(moduleNames("poses").map((n) => [n, R(`poses/${n}.svg`)])),
    },
    demo: R("demo/index.html"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: fail.length === 0, failures: fail }, null, 2));
  } else if (fail.length) {
    console.error(`\n✗ маскот: ${fail.length} пропуск(а)\n`);
    for (const f of fail) console.error(`  • ${f}`);
    console.error("");
  } else {
    console.log(`✓ маскот: ${Object.keys(svgs).length} SVG (${moduleNames("faces").length} изражения · ${moduleNames("poses").length} пози) · компонентът е в синхрон · палитрата е чиста · достъпност и правила за консистентност са спазени`);
  }
  process.exit(fail.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
