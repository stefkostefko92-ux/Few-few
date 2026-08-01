#!/usr/bin/env node
// mascot-theme.mjs — облича маскота от `mascot/` в цвета на всеки агент.
//
// Маскотът е ЕДИН герой (една геометрия, един характер) — това е нарочно. Различава се само по
// ЦВЯТ, взет от `accent` в agents-dashboard/agents.json. Затова тук няма нито един път, нито една
// форма: този инструмент само пребоядисва и преименува id-та. Формата се поправя на едно място —
// в `mascot/`, а промяната стига до 28-те агента с едно пускане.
//
// ── Как става пребоядисването ────────────────────────────────────────────────────────────────
// Палитрата на маскота е зелена РАМПА (deep → bottle → neon → olive → pale). Обемът на желето
// стои на СВЕТЛОТАТА на тези спирки, не на тона им. Затова пренасяме тона на агента, а светлотата
// пазим 1:1 — иначе тялото се сплесква. Наситеността е претеглена смес, за да не станат бледите
// акценти безжизнени, а крещящите — флуоресцентни.
// Аксесоарите (черно за очила/шапка/папийонка, злато за пискюла, топло бяло за окото) НЕ се пипат:
// те са идентичността на ГЕРОЯ; цветът е идентичността на АГЕНТА.
//
// ── Защо id-тата се преименуват ──────────────────────────────────────────────────────────────
// Реален дефект, който хванах при пробата: осем маскота на една страница се рисуваха с градиента
// на ПЪРВИЯ, защото делят `id="jm-body"`. Браузърът взема първата дефиниция. Затова всеки файл
// получава префикс по id на агента. (Същото пише и в PR #162 за React компонента — там го решава
// `useId`.)
//
//   node tools/agents/mascot-theme.mjs           # записва agents-dashboard/mascots/
//   node tools/agents/mascot-theme.mjs --check   # гейт: всеки агент има сверен маскот

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASCOT = join(ROOT, "mascot");
const OUT_DIR = join(ROOT, "agents-dashboard", "mascots");
const CHECK = process.argv.includes("--check");

// ── цвят ─────────────────────────────────────────────────────────────────────────────────────
const hex2rgb = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };
const rgb2hex = (r, g, b) => "#" + [r, g, b].map((v) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

export function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
export function hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return t.map((v) => v + m);
}

/** Спирка от рампата → същата светлота, тонът на агента.
 *  `shift` върти тона спрямо акцента, `emit` вдига светлота/наситеност (емисия, не обем). */
export function retint(rampHex, accentHex, shift = 0, emit = 0) {
  const [, s0, l0] = rgb2hsl(...hex2rgb(rampHex));
  const [ha, sa] = rgb2hsl(...hex2rgb(accentHex));
  const s = Math.min(1, (s0 * 0.55 + sa * 0.55) * (1 + emit * 0.7));
  const l = Math.min(0.97, l0 + emit * (1 - l0) * 0.55);
  return rgb2hex(...hsl2rgb((ha + shift + 360) % 360, s, l));
}

// ── защо тонът се РАЗЛИВА, а не стои на едно място ───────────────────────────────────────────
// Един тон на всичките пет спирки прави телцето едноцветно — 28 еднакво плоски мармаладчета.
// Истинското желе не е такова: дългите вълни проникват по-надълбоко, затова осветените, тънки
// части се топлят, а дълбоката сянка изстива. Затова носим тона на агента като ОС, а спирките
// го въртят около нея — към топлото нагоре по рампата, от топлото надолу. Всяко телце носи два
// цвята, а разликата между агентите расте, защото различните акценти се въртят различно.
const WARM = 40;                       // оранжевото, към което тегли подповърхностното разсейване
const SPREAD = { deep: -0.34, bottle: -0.18, neon: 0, olive: 0.26, pale: 0.46 };
// Емисията живее в горните спирки: точно те пълнят ядрото, подсветката, каустиката и ореола
// (`jm-core`, `jm-underglow`, `jm-caustic-pool`, `jm-bloom` в маскота). Вдигната светлота там =
// светене отвътре, без да пипаме нито един филтър и без да пипаме обема на тялото.
const EMIT = { olive: 0.34, pale: 0.2 };

/** Колко градуса да е разливът за даден акцент — винаги реален, никога нула. */
export function hueSpread(accentHex) {
  const [h] = rgb2hsl(...hex2rgb(accentHex));
  const d = ((WARM - h + 540) % 360) - 180;      // накъде е топлото по КЪСАТА дъга
  const dir = Math.sign(d) || 1;
  // Долната граница пази от изражданe: акцент, който вече е оранжев, иначе би дал нулев разлив
  // и точно оранжевите агенти щяха да останат едноцветни. Горната пази героя да е един и същ —
  // над ~90° двата края спират да четат като едно тяло.
  return dir * Math.min(90, Math.max(34, Math.abs(d)));
}

/** Кои токени са ТЯЛО (пребоядисват се) и кои са ГЕРОЙ (остават). */
export const BODY_TOKENS = ["deep", "bottle", "neon", "olive", "pale", "soft-olive", "glow-lime"];

export function themeFor(accent, tokens) {
  const base = { ...tokens.sampled, ...tokens.extended };
  const spread = hueSpread(accent);
  const out = {};
  for (const k of BODY_TOKENS) {
    if (!base[k]) continue;
    out[`--jm-${k}`] = retint(base[k].hex, accent, spread * (SPREAD[k] || 0), EMIT[k] || 0);
  }
  return out;
}

/** Заменя падащите стойности в `var(--jm-x, #HEX)` с цвета на агента.
 *  Пипаме fallback-а, не добавяме CSS: така файлът е верен и когато се ползва като <img>,
 *  където външен CSS изобщо не стига. */
export function applyTheme(svg, vars) {
  return svg.replace(/var\((--jm-[a-z-]+),\s*(#[0-9A-Fa-f]{3,8})\)/g,
    (m, name, fallback) => `var(${name}, ${vars[name] || fallback})`);
}

/** Префиксира всички id-та — иначе няколко маскота на страница делят първия градиент. */
export function namespaceIds(svg, prefix) {
  return svg
    .replace(/id="([^"]+)"/g, (m, id) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${prefix}-${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (m, attr, id) => `${attr}="#${prefix}-${id}"`);
}

// `animated` носи вградения <style> на пакета: bob, пулс, мигане, люлеещ се пискюл, издигащи се
// мехурчета — и `.jm-pupils`, който се мести от `--jm-gaze-x/y`. Точно затова профилът в таблото
// ползва ТОЗИ вариант, вграден инлайн: така курсорът може да води погледа, без нито един ререндер.
const LEVELS = {
  full: "jelly-mascot-full.svg",
  icon: "jelly-mascot-icon.svg",
  animated: "jelly-mascot-full-animated.svg",
};

export function mascotFor(agent, level, tokens, sources) {
  const vars = themeFor(agent.accent, tokens);
  let svg = sources[level];
  svg = applyTheme(svg, vars);
  svg = namespaceIds(svg, `${agent.id}-${level}`);
  // Името на агента влиза в достъпното име — иначе 28 маскота звучат еднакво за екранен четец.
  svg = svg.replace(/<title[^>]*>[\s\S]*?<\/title>/,
    `<title>${agent.name} — ${agent.title || "агент"}</title>`);
  return svg;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
function load() {
  const tokens = JSON.parse(readFileSync(join(MASCOT, "tokens.json"), "utf8"));
  const sources = Object.fromEntries(Object.entries(LEVELS)
    .map(([k, f]) => [k, readFileSync(join(MASCOT, "svg", f), "utf8")]));
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  return { tokens, sources, agents: reg.agents || reg };
}
const wanted = ({ tokens, sources, agents }) => agents.flatMap((a) =>
  Object.keys(LEVELS).map((lvl) => [`${a.id}${lvl === "full" ? "" : "-" + lvl}.svg`, mascotFor(a, lvl, tokens, sources)]));

// ── вграденият блок в таблото ────────────────────────────────────────────────────────────────
// Профилът показва АНИМИРАНИЯ маскот, а не картинка: само вграден SVG може да получи погледа от
// курсора (`--jm-gaze-x/y`). Но 28 вградени копия биха надули файла и биха се сблъскали по `id`.
// Затова вграждаме ГЕОМЕТРИЯТА веднъж и подаваме само ЦВЕТА за конкретния агент — точно за това е
// направена токен системата на маскота.
// Темите се смятат ТУК (Node), не в браузъра: втора имплементация на пребоядисването щеше да
// дрейфне от тази при първата поправка. Гейтът сравнява вградения блок с генератора.
const MARK_START = "/* MASCOT-INLINE:START — генериран от tools/agents/mascot-theme.mjs, не редактирай */";
const MARK_END = "/* MASCOT-INLINE:END */";

export function inlineBlock({ tokens, sources, agents }) {
  const themes = Object.fromEntries(agents.map((a) => [a.id, themeFor(a.accent, tokens)]));
  // Геометрията е обща, затова `id`-тата се префиксват веднъж с неутрален префикс. В профила
  // живее най-много ЕДИН маскот наведнъж, значи сблъсък няма.
  const svg = namespaceIds(sources.animated, "jmx")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, "<title>Маскотът на агента</title>");
  return [
    MARK_START,
    `const MASCOT_SVG = ${JSON.stringify(svg)};`,
    `const MASCOT_THEMES = ${JSON.stringify(themes)};`,
    MARK_END,
  ].join("\n");
}

/** Подменя блока в index.html. Връща новия текст (или същия, ако маркерите липсват). */
export function withInlineBlock(html, block) {
  const s = html.indexOf(MARK_START), e = html.indexOf(MARK_END);
  if (s === -1 || e === -1) return html;
  return html.slice(0, s) + block + html.slice(e + MARK_END.length);
}
export const INLINE_MARKERS = { MARK_START, MARK_END };

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(MASCOT)) {
    console.error("\x1b[31m✗ липсва mascot/ — маскотът идва от пакета, не се рисува тук.\x1b[0m");
    process.exit(1);
  }
  const ctx = load();
  const want = wanted(ctx);
  const HTML = join(ROOT, "agents-dashboard", "index.html");
  const block = inlineBlock(ctx);
  if (CHECK) {
    const html = readFileSync(HTML, "utf8");
    if (!html.includes(MARK_START)) {
      console.error("\x1b[31m✗ таблото няма MASCOT-INLINE блок\x1b[0m — профилът не може да покаже жив маскот.");
      process.exit(1);
    }
    if (withInlineBlock(html, block) !== html) {
      console.error("\x1b[31m✗ вграденият маскот в таблото е застоял\x1b[0m (маскотът или акцент е сменен).");
      console.error("  Пусни: node tools/agents/mascot-theme.mjs");
      process.exit(1);
    }
    const missing = want.filter(([f]) => !existsSync(join(OUT_DIR, f))).map(([f]) => f);
    const stale = want.filter(([f, body]) => existsSync(join(OUT_DIR, f)) &&
      readFileSync(join(OUT_DIR, f), "utf8") !== body).map(([f]) => f);
    const known = new Set(want.map(([f]) => f));
    const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => !known.has(f)) : [];
    if (missing.length || stale.length || extra.length) {
      if (missing.length) console.error(`  липсват: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`);
      if (stale.length) console.error(`  застояли (маскотът в mascot/ е сменен): ${stale.slice(0, 6).join(", ")}${stale.length > 6 ? " …" : ""}`);
      if (extra.length) console.error(`  сирачета: ${extra.slice(0, 6).join(", ")}`);
      console.error("\n\x1b[31m✗ маскоти: разсинхрон.\x1b[0m Пусни: node tools/agents/mascot-theme.mjs");
      process.exit(1);
    }
    console.log(`\x1b[32m✓ маскоти: ${ctx.agents.length} агента × ${Object.keys(LEVELS).length} нива, сверени с mascot/.\x1b[0m`);
    process.exit(0);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [f, body] of want) writeFileSync(join(OUT_DIR, f), body);
  const html = readFileSync(HTML, "utf8");
  const next = withInlineBlock(html, block);
  if (next === html && !html.includes(MARK_START)) {
    console.error("\x1b[33m⚠ таблото няма MASCOT-INLINE маркери — вграденият маскот НЕ е обновен.\x1b[0m");
  } else if (next !== html) {
    writeFileSync(HTML, next);
  }
  console.log(`\x1b[32m✓ ${want.length} файла\x1b[0m (${ctx.agents.length} агента × ${Object.keys(LEVELS).length} нива) + вграден маскот в таблото`);
}
