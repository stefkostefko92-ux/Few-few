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

/** Спирка от рампата → същата светлота, тонът на агента. */
export function retint(rampHex, accentHex) {
  const [, s0, l0] = rgb2hsl(...hex2rgb(rampHex));
  const [ha, sa] = rgb2hsl(...hex2rgb(accentHex));
  const s = Math.min(1, s0 * 0.55 + sa * 0.55);
  return rgb2hex(...hsl2rgb(ha, s, l0));
}

/** Кои токени са ТЯЛО (пребоядисват се) и кои са ГЕРОЙ (остават). */
export const BODY_TOKENS = ["deep", "bottle", "neon", "olive", "pale", "soft-olive", "glow-lime"];

export function themeFor(accent, tokens) {
  const base = { ...tokens.sampled, ...tokens.extended };
  const out = {};
  for (const k of BODY_TOKENS) if (base[k]) out[`--jm-${k}`] = retint(base[k].hex, accent);
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

const LEVELS = { full: "jelly-mascot-full.svg", icon: "jelly-mascot-icon.svg" };

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

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(MASCOT)) {
    console.error("\x1b[31m✗ липсва mascot/ — маскотът идва от пакета, не се рисува тук.\x1b[0m");
    process.exit(1);
  }
  const ctx = load();
  const want = wanted(ctx);
  if (CHECK) {
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
  console.log(`\x1b[32m✓ ${want.length} файла\x1b[0m (${ctx.agents.length} агента × ${Object.keys(LEVELS).length} нива) → agents-dashboard/mascots/`);
}
