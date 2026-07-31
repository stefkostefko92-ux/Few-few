#!/usr/bin/env node
// mascots.mjs — генерира по един SVG маскот за всеки агент от agents.json.
//
// Една анатомия (желеобразно тяло, очи с гланц, мехурчета, неонов ореол) + три променливи:
// ЦВЯТ (акцентът на агента от регистъра), ШАПКА и РЕКВИЗИТ (по домейн). Така 28-те са разпознаваемо
// едно семейство, но всеки се различава от пръв поглед.
//
// Техника: radialGradient с три спирки (светло → акцент → тъмно) + feGaussianBlur/feMerge за
// неоновия ореол. Нула зависимости, нула растер — чист вектор, безкрайно мащабируем.
//
// Геометрия (научено при първия ран, който ГЛЕДАХ, а не предположих):
//   • реквизитът се рисува в ЛОКАЛНА кутия 0..120 и се поставя веднъж — иначе се изрязваше от платното;
//   • има РЪКА до реквизита, иначе той виси във въздуха;
//   • ореолът е ОТДЕЛЕН размазан силует в цвета на агента ПОД тялото — филтър върху цялата група
//     размазва и тъмните части и ефектът изчезва;
//   • тялото е крушовидно (тясно горе, широко долу), не кръг.
//
//   node tools/agents/mascots.mjs            # записва agents-dashboard/mascots/<id>.svg
//   node tools/agents/mascots.mjs --check    # проверява, че всеки агент има сверен маскот

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "agents-dashboard", "mascots");
const CHECK = process.argv.includes("--check");

// ── цвят ─────────────────────────────────────────────────────────────────────────────────────
const hex2rgb = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const rgb2hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Изсветлява (t>0) или потъмнява (t<0) — стабилно за всеки акцент. */
const shade = (hex, t) => {
  const [r, g, b] = hex2rgb(hex);
  const m = t >= 0 ? 255 : 0, k = Math.abs(t);
  return rgb2hex(r + (m - r) * k, g + (m - g) * k, b + (m - b) * k);
};

// ── реквизит (локална кутия ~0..120, поставя се веднъж) ──────────────────────────────────────
const PROPS = {
  показалка: (c) => `<rect x="0" y="52" width="118" height="9" rx="4" fill="#8a5a2b" transform="rotate(-18 0 56)"/>
    <circle cx="112" cy="19" r="8" fill="${c}"/>`,
  лупа: (c) => `<circle cx="46" cy="40" r="30" fill="none" stroke="${c}" stroke-width="10"/>
    <circle cx="46" cy="40" r="23" fill="#ffffff" opacity=".2"/>
    <rect x="62" y="62" width="46" height="11" rx="5" fill="#9fb0c4" transform="rotate(40 62 62)"/>`,
  ключ: (c) => `<rect x="0" y="46" width="86" height="13" rx="6" fill="#9fb0c4"/>
    <path d="M86 30 a23 23 0 1 1 0 46 a15 15 0 1 0 0-46Z" fill="#cfd9e6"/>
    <circle cx="8" cy="52" r="11" fill="${c}"/>`,
  везна: (c) => `<rect x="52" y="16" width="9" height="82" rx="4" fill="#9a7b2f"/>
    <rect x="4" y="10" width="106" height="9" rx="4" fill="#c9a227"/>
    <path d="M16 20 l-14 30 h28Z" fill="${c}"/><path d="M98 20 l-14 30 h28Z" fill="${c}"/>
    <rect x="34" y="96" width="46" height="9" rx="4" fill="#9a7b2f"/>`,
  щит: (c) => `<path d="M56 6 L104 26 v38 c0 34-26 56-48 66 -22-10-48-32-48-66 V26Z" fill="${c}"/>
    <path d="M56 20 L90 34 v30 c0 25-18 42-34 50 -16-8-34-25-34-50 V34Z" fill="#ffffff" opacity=".24"/>`,
  геймпад: (c) => `<rect x="0" y="30" width="118" height="56" rx="27" fill="#3b4252"/>
    <rect x="20" y="52" width="28" height="8" rx="4" fill="#cfd9e6"/>
    <rect x="30" y="42" width="8" height="28" rx="4" fill="#cfd9e6"/>
    <circle cx="86" cy="50" r="8" fill="${c}"/><circle cx="102" cy="66" r="8" fill="${c}"/>`,
  мълния: (c) => `<path d="M62 2 L22 62 h30 L36 118 l62-72 h-32 L96 2Z" fill="${c}"/>
    <path d="M62 2 L22 62 h30 L36 118 l62-72 h-32 L96 2Z" fill="#ffffff" opacity=".28" transform="translate(4,6) scale(.8)"/>`,
  количка: (c) => `<path d="M2 14 h18 l16 62 h66 l14-42 H40" fill="none" stroke="${c}" stroke-width="10"
      stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="48" cy="92" r="10" fill="${c}"/><circle cx="96" cy="92" r="10" fill="${c}"/>`,
  диаграма: (c) => `<rect x="4" y="62" width="24" height="46" rx="6" fill="${c}" opacity=".55"/>
    <rect x="38" y="38" width="24" height="70" rx="6" fill="${c}" opacity=".8"/>
    <rect x="72" y="10" width="24" height="98" rx="6" fill="${c}"/>`,
  четка: (c) => `<rect x="0" y="52" width="78" height="11" rx="5" fill="#8a5a2b"/>
    <rect x="76" y="44" width="22" height="27" rx="5" fill="#9fb0c4"/>
    <path d="M98 44 h16 a10 10 0 0 1 10 10 v7 a10 10 0 0 1-10 10 H98Z" fill="${c}"/>`,
  куб: (c) => `<path d="M56 6 L108 34 L56 62 L4 34Z" fill="${shade(c, .3)}"/>
    <path d="M4 34 L56 62 v54 L4 88Z" fill="${shade(c, -.2)}"/>
    <path d="M108 34 L56 62 v54 l52-28Z" fill="${c}"/>`,
  книга: (c) => `<path d="M2 20 c22-11 44-11 62 0 v70 c-18-11-40-11-62 0Z" fill="${shade(c, -.2)}"/>
    <path d="M64 20 c18-11 40-11 62 0 v70 c-22-11-44-11-62 0Z" fill="${c}"/>
    <rect x="60" y="16" width="7" height="78" rx="3" fill="#2b3242"/>`,
  терминал: (c) => `<rect x="0" y="18" width="118" height="84" rx="11" fill="#1b2130" stroke="${c}" stroke-width="5"/>
    <path d="M20 44 l20 16 -20 16" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="52" y="72" width="42" height="7" rx="3" fill="${c}"/>`,
  монета: (c) => `<ellipse cx="56" cy="66" rx="48" ry="48" fill="${shade(c, -.3)}"/>
    <ellipse cx="56" cy="58" rx="48" ry="48" fill="${c}"/>
    <text x="56" y="74" font-size="52" font-family="DejaVu Sans, sans-serif" font-weight="bold"
          text-anchor="middle" fill="${shade(c, -.4)}">€</text>`,
  сървър: (c) => `<rect x="4" y="18" width="96" height="32" rx="7" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <rect x="4" y="60" width="96" height="32" rx="7" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <circle cx="22" cy="34" r="6" fill="${c}"/><circle cx="22" cy="76" r="6" fill="${c}"/>`,
  телефон: (c) => `<rect x="26" y="8" width="68" height="116" rx="14" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <rect x="35" y="22" width="50" height="82" rx="5" fill="${c}" opacity=".55"/>
    <circle cx="60" cy="113" r="5" fill="${c}"/>`,
};

// ── шапка ────────────────────────────────────────────────────────────────────────────────────
const HATS = {
  няма: () => "",
  дипломна: () => `<g transform="translate(256,118)">
      <path d="M-96 0 L0 -38 L96 0 L0 38Z" fill="#161b26"/>
      <path d="M-52 12 v30 c0 14 104 14 104 0 V12 L0 36Z" fill="#0f131c"/>
      <rect x="80" y="-4" width="6" height="46" rx="3" fill="#c9a227"/>
      <circle cx="83" cy="46" r="9" fill="#c9a227"/></g>`,
  каска: (c) => `<g transform="translate(256,132)">
      <path d="M-78 14 C-78 -34 -44 -58 0 -58 C44 -58 78 -34 78 14Z" fill="${c}"/>
      <path d="M-58 6 C-58 -30 -32 -46 -6 -46 C-22 -38 -40 -22 -44 6Z" fill="#ffffff" opacity=".28"/>
      <path d="M-92 14 h184 a10 10 0 0 1-10 14 h-164 a10 10 0 0 1-10-14Z" fill="${shade(c, -.3)}"/>
      <rect x="-6" y="-56" width="12" height="26" rx="6" fill="${shade(c, .38)}"/></g>`,
  корона: (c) => `<g transform="translate(256,116)">
      <path d="M-62 28 L-62 -12 L-30 12 L0 -28 L30 12 L62 -12 L62 28Z" fill="#e8c34a"/>
      <circle cx="-62" cy="-18" r="8" fill="${c}"/><circle cx="0" cy="-34" r="9" fill="${c}"/>
      <circle cx="62" cy="-18" r="8" fill="${c}"/></g>`,
  // Качулката НЕ бива да яде лицето — рамкира го отгоре и отстрани, но оставя очите открити.
  качулка: (c) => `<g transform="translate(256,196)">
      <path d="M-104 6 a104 118 0 0 1 208 0 l0 26 a86 86 0 0 0-52-58 a92 92 0 0 0-104 0 a86 86 0 0 0-52 58Z"
            fill="#12161f"/>
      <path d="M-98 26 a98 108 0 0 1 196 0 l0 18 a80 80 0 0 0-46-52 a88 88 0 0 0-104 0 a80 80 0 0 0-46 52Z"
            fill="${shade(c, -.55)}"/></g>`,
  слушалки: (c) => `<g transform="translate(256,196)">
      <path d="M-96 12 a96 106 0 0 1 192 0" fill="none" stroke="#2b3242" stroke-width="15"/>
      <rect x="-116" y="4" width="32" height="56" rx="15" fill="${c}"/>
      <rect x="84" y="4" width="32" height="56" rx="15" fill="${c}"/></g>`,
  барета: (c) => `<g transform="translate(256,128) rotate(-9)">
      <path d="M-88 8 C-88 -34 -50 -54 -4 -54 C48 -54 92 -36 92 -2 C92 16 60 26 12 26 C-40 26 -88 22 -88 8Z" fill="${c}"/>
      <path d="M-62 0 C-62 -30 -34 -44 -2 -44 C-24 -34 -44 -18 -48 4Z" fill="#ffffff" opacity=".3"/>
      <path d="M-88 8 C-70 20 40 26 92 -2 C92 14 58 28 8 28 C-42 28 -88 22 -88 8Z" fill="${shade(c, -.3)}"/>
      <circle cx="-2" cy="-58" r="10" fill="${shade(c, -.35)}"/></g>`,
};

// ── кой какво носи ───────────────────────────────────────────────────────────────────────────
const LOOK = {
  "pravniyat-razbirach": ["везна", "няма"], kodadjiyata: ["ключ", "каска"],
  kachestveniyat: ["лупа", "няма"], geymara: ["геймпад", "слушалки"],
  seo: ["лупа", "няма"], skorostnika: ["мълния", "каска"],
  dizayner: ["четка", "барета"], "3d-maniac": ["куб", "няма"],
  printadjiyata: ["куб", "каска"], prodavacha: ["количка", "няма"],
  kasadjiyata: ["монета", "няма"], treydara: ["диаграма", "няма"],
  goladjiyata: ["диаграма", "няма"], analizatora: ["диаграма", "няма"],
  letopisetsa: ["книга", "дипломна"], prevodach: ["книга", "няма"],
  siydara: ["книга", "няма"], "ai-djiyata": ["показалка", "корона"],
  konveyera: ["терминал", "каска"], "vps-adjiyata": ["сървър", "каска"],
  nabludatelya: ["диаграма", "слушалки"], izpitatelya: ["терминал", "няма"],
  razbivacha: ["щит", "качулка"], "tayniyat-agent": ["щит", "качулка"],
  hromadjiyata: ["щит", "няма"], diskordjiyata: ["геймпад", "слушалки"],
  socialdjiyata: ["телефон", "няма"], mobildjiyata: ["телефон", "няма"],
};
const FALLBACK_LOOK = ["показалка", "няма"];

// Крушовидното тяло — един път, ползван и за силуета на ореола.
const BODY = "M256 96 C336 96 398 158 404 236 C412 336 350 448 256 448 C162 448 100 336 108 236 C114 158 176 96 256 96Z";

export function mascotSvg(agent) {
  const c = agent.accent || "#7c6cf0";
  const light = shade(c, .58), dark = shade(c, -.48);
  const [propName, hatName] = LOOK[agent.id] || FALLBACK_LOOK;
  const prop = (PROPS[propName] || PROPS["показалка"])(shade(c, .38));
  const hat = (HATS[hatName] || HATS["няма"])(c);
  const id = agent.id.replace(/[^a-z0-9-]/gi, "");

  const bubbles = [[186, 262, 15], [306, 218, 11], [228, 336, 19], [322, 344, 13], [166, 352, 9], [274, 404, 12]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity=".22"/>` +
      `<circle cx="${x - r / 3}" cy="${y - r / 3}" r="${r / 3}" fill="#ffffff" opacity=".45"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${agent.name}">
  <title>${agent.name} — ${agent.title || ""}</title>
  <defs>
    <radialGradient id="body-${id}" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="45%" stop-color="${c}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </radialGradient>
    <filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Ореолът е ОТДЕЛЕН силует под тялото: филтър върху цялата фигура размазва и тъмните части. -->
  <path d="${BODY}" fill="${c}" filter="url(#glow-${id})" opacity=".55"/>
  <ellipse cx="256" cy="452" rx="126" ry="18" fill="${c}" opacity=".25"/>

  <!-- Ръка + реквизит. Реквизитът се рисува в локална кутия 0..120 и се поставя ВЕДНЪЖ.
       Мащабът и отместването са подбрани така, че да е ИЗВЪН силуета на тялото (то стига до x≈404)
       и вътре в платното (макс. x = 392 + 120·0.82 ≈ 490) — първата версия го оставяше да пронизва корема. -->
  <path d="M382 322 q26 -6 42 -22" fill="none" stroke="${shade(c, -.28)}" stroke-width="24" stroke-linecap="round"/>
  <g transform="translate(392,250) scale(.82)">${prop}</g>

  <path d="${BODY}" fill="url(#body-${id})"/>
  <path d="M158 196 C182 150 220 132 250 138 C218 156 184 186 168 226Z" fill="#ffffff" opacity=".4"/>
  ${bubbles}

  <ellipse cx="212" cy="256" rx="33" ry="35" fill="#0d1017"/>
  <ellipse cx="300" cy="256" rx="33" ry="35" fill="#0d1017"/>
  <circle cx="202" cy="244" r="11" fill="#ffffff"/><circle cx="290" cy="244" r="11" fill="#ffffff"/>
  <circle cx="220" cy="270" r="5" fill="#ffffff" opacity=".7"/><circle cx="308" cy="270" r="5" fill="#ffffff" opacity=".7"/>
  <g fill="none" stroke="#12161f" stroke-width="7">
    <circle cx="212" cy="256" r="44"/><circle cx="300" cy="256" r="44"/>
    <path d="M256 256 h0"/><path d="M168 248 l-24 -8"/><path d="M344 248 l24 -8"/>
  </g>
  <path d="M234 324 q22 24 44 0" fill="none" stroke="#12161f" stroke-width="8" stroke-linecap="round"/>
  <path d="M256 366 l-25 -15 v30Z M256 366 l25 -15 v30Z" fill="#12161f"/>
  <circle cx="256" cy="366" r="7.5" fill="#12161f"/>
  ${hat}
</svg>
`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
function agents() {
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  return reg.agents || reg;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = agents();
  if (CHECK) {
    const missing = list.filter((a) => !existsSync(join(OUT_DIR, `${a.id}.svg`)));
    const stale = list.filter((a) => existsSync(join(OUT_DIR, `${a.id}.svg`)) &&
      readFileSync(join(OUT_DIR, `${a.id}.svg`), "utf8") !== mascotSvg(a));
    const extra = existsSync(OUT_DIR)
      ? readdirSync(OUT_DIR).filter((f) => f.endsWith(".svg") && !list.some((a) => `${a.id}.svg` === f)) : [];
    if (missing.length || stale.length || extra.length) {
      if (missing.length) console.error(`  липсват маскоти: ${missing.map((a) => a.id).join(", ")}`);
      if (stale.length) console.error(`  застояли (генераторът дава друго): ${stale.map((a) => a.id).join(", ")}`);
      if (extra.length) console.error(`  сирачета (агентът го няма): ${extra.join(", ")}`);
      console.error("\n\x1b[31m✗ маскоти: разсинхрон.\x1b[0m Пусни: node tools/agents/mascots.mjs");
      process.exit(1);
    }
    console.log(`\x1b[32m✓ маскоти: ${list.length} на брой, всички сверени с генератора.\x1b[0m`);
    process.exit(0);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const a of list) writeFileSync(join(OUT_DIR, `${a.id}.svg`), mascotSvg(a));
  console.log(`\x1b[32m✓ записани ${list.length} маскота\x1b[0m → agents-dashboard/mascots/`);
}
