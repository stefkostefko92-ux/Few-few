#!/usr/bin/env node
// tools/design/motion-a11y.mjs — достъпност на движение за визуалните ефекти (Дизайнера v2.0).
//
// Употреба:
//   node tools/design/motion-a11y.mjs <папка>
//
// Евристичен. Маркира нарушения на неподлежащите на компромис правила: анимация без
// `prefers-reduced-motion` gate, авто-play/луп без контрол (WCAG 2.2.2), WebGL/Three без
// reduced-motion проверка, inline <script> (CSP риск за medqr), вероятен строб (WCAG 2.3.1).
// Exit 1 при HIGH. НЕ замества реален FPS/Lighthouse профил в браузъра.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const CREATIVE = args.includes("--creative"); // творчески режим: reduced-motion е по избор
const root = args.find((a) => !a.startsWith("--"));
if (!root) { console.error("Употреба: node tools/design/motion-a11y.mjs <папка> [--creative]"); process.exit(2); }
// В сериозен режим (по подразбиране) липсата на reduced-motion е HIGH; в творчески — само INFO.
// Анти-строб (2.3.1) остава универсално и в двата режима.
const RM_SEV = CREATIVE ? "INFO" : "HIGH";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "out"]);
function walk(dir, acc = [], depth = 0) {
  if (depth > 6) return acc;
  let e = []; try { e = readdirSync(dir); } catch { return acc; }
  for (const name of e) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc, depth + 1);
    else if (/\.(css|scss|js|mjs|jsx|ts|tsx|vue|svelte|html|ejs|astro)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk(root);
const texts = new Map();
for (const f of files) { try { texts.set(f, readFileSync(f, "utf8")); } catch { /* skip */ } }

// Има ли ИЗОБЩО reduced-motion guard някъде в кодовата база?
const hasReducedMotionGuard = [...texts.values()].some(
  (t) => /prefers-reduced-motion\s*:\s*reduce/.test(t) || /prefers-reduced-motion/.test(t)
);

const findings = [];
const add = (sev, id, file, msg) => findings.push({ sev, id, file, msg });

let anyAnimation = false;
for (const [f, t] of texts) {
  const ext = extname(f);
  const isStyle = /\.(css|scss)$/.test(ext) || /<style/.test(t);

  // 1. Анимация/transition в стил без reduced-motion (на ниво база)
  if (isStyle && /(@keyframes|animation\s*:|animation-name\s*:|transition\s*:)/.test(t)) {
    anyAnimation = true;
    if (!hasReducedMotionGuard)
      add(RM_SEV, "no-reduced-motion", f, "Анимация/transition, а никъде в базата няма `prefers-reduced-motion: reduce` gate." + (CREATIVE ? " (творчески режим: по избор)" : ""));
  }

  // 2. Авто-play / луп без контрол (WCAG 2.2.2)
  if (/<video[^>]*\bautoplay\b/i.test(t) && !/\bcontrols\b/i.test(t))
    add("MED", "autoplay-no-controls", f, "<video autoplay> без `controls` — авто-движение >5s иска пауза/стоп (WCAG 2.2.2).");
  if (/animation[^;]*infinite/i.test(t))
    add("INFO", "infinite-loop", f, "Безкраен `animation … infinite` — осигури пауза (2.2.2) и че не строби (2.3.1).");

  // 3. WebGL/Three без reduced-motion проверка във файла
  if (/(new\s+THREE\.|WebGLRenderer|WebGPURenderer|getContext\(['\"]webgl|@react-three\/fiber|new\s+OGL|PIXI\.)/.test(t)) {
    anyAnimation = true;
    if (!/prefers-reduced-motion|matchMedia/.test(t))
      add(RM_SEV, "webgl-no-rm-check", f, "WebGL/Three/Pixi без `matchMedia('prefers-reduced-motion')` проверка + fallback (teardown → статика)." + (CREATIVE ? " (творчески режим: по избор)" : ""));
  }

  // 4. Inline <script> с тяло (CSP риск — medqr ползва nonce, без inline)
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(t);
  if (inlineScript && !/nonce=/.test(t))
    add("MED", "inline-script-csp", f, "Inline <script> без nonce — чупи CSP (medqr). Изнеси логиката в public/app.js.");

  // 5. Вероятен строб: кратък безкраен keyframe с opacity/visibility/filter flicker
  const strobe = t.match(/animation\s*:[^;]*?(0?\.[0-2]\d?|[0-9]{1,3})ms[^;]*infinite/i);
  if (strobe) add("MED", "possible-strobe", f, `Бърза безкрайна анимация (${strobe[0].slice(0,40)}…) — провери да НЕ строби >3/сек (WCAG 2.3.1, епилепсия).`);
}

// доклад
const order = { HIGH: 0, MED: 1, INFO: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev]);
if (!findings.length) {
  console.log(`✅ motion-a11y: чисто (${files.length} файла в ${root})` + (anyAnimation ? " — анимация има, reduced-motion gate присъства." : " — без засечена анимация."));
  process.exit(0);
}
console.log(`motion-a11y [${CREATIVE ? "творчески" : "сериозен"} режим]: ${findings.length} находки (${root})\n`);
for (const f of findings) console.log(`[${f.sev}] (${f.id}) ${f.msg}\n        ${f.file}`);
const high = findings.filter((f) => f.sev === "HIGH").length;
console.log(`\n${high} HIGH · ${findings.length - high} по-ниски. Reduced-motion gate в базата: ${hasReducedMotionGuard ? "ДА" : "НЕ ❌"}.` +
  (CREATIVE ? " (творчески: reduced-motion по избор; анти-строб остава.)" : " (сериозен режим — добави --creative за творчески сайт.)") +
  " Евристично — потвърди с FPS/Lighthouse профил.");
process.exit(high > 0 ? 1 : 0);
