#!/usr/bin/env node
// mascots.mjs — генерира по един SVG маскот за всеки агент от agents.json.
//
// Анатомията е по подадения от собственика React/CSS образец (Mascot/Body/Eyes), пренесена в
// генератор: 4-степенен градиент на тялото, вътрешно сияние, долно засенчване, feDropShadow,
// вежди, бузки, мигане, плаване и пулсация. Координатната система е тяхната — viewBox 300×300 —
// за да се пренесе геометрията им точно, вместо да я преизмислям.
//
// Променливото е ТРИ неща: ЦВЯТ (акцентът от регистъра), ШАПКА и РЕКВИЗИТ (по домейн). Затова
// 28-те са едно семейство с 28 лица, а нов агент получава маскот автоматично.
//
// Цвят: четирите спирки се извеждат от акцента (shade .78 / .45 / чист / −.38). Проверено срещу
// техния зелен: #D7FFE5 #8BFFAF #42FF78 #18AE56 → изведените са на едно око разстояние и работят
// за всеки от 28-те акцента, вместо да са ръчно подбрани за един цвят.
//
//   node tools/agents/mascots.mjs            # записва agents-dashboard/mascots/<id>.svg + React
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
const shade = (hex, t) => {
  const [r, g, b] = hex2rgb(hex);
  const m = t >= 0 ? 255 : 0, k = Math.abs(t);
  return rgb2hex(r + (m - r) * k, g + (m - g) * k, b + (m - b) * k);
};
/** rgba() от hex — за drop-shadow слоевете, които в образеца са зашити в зелено. */
const rgba = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };

// ── реквизит (локална кутия ~0..120, мащабира се при поставяне) ──────────────────────────────
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
    <text x="56" y="76" font-size="54" font-family="DejaVu Sans, sans-serif" font-weight="bold"
          text-anchor="middle" fill="${shade(c, -.42)}">€</text>`,
  сървър: (c) => `<rect x="4" y="18" width="96" height="32" rx="7" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <rect x="4" y="60" width="96" height="32" rx="7" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <circle cx="22" cy="34" r="6" fill="${c}"/><circle cx="22" cy="76" r="6" fill="${c}"/>`,
  телефон: (c) => `<rect x="26" y="8" width="68" height="116" rx="14" fill="#2b3242" stroke="${c}" stroke-width="5"/>
    <rect x="35" y="22" width="50" height="82" rx="5" fill="${c}" opacity=".55"/>
    <circle cx="60" cy="113" r="5" fill="${c}"/>`,
};

// ── шапка (координати в 300-та система, темето е около y≈66) ─────────────────────────────────
const HATS = {
  няма: () => "",
  // Дипломната е точно от образеца — само тасселът е изнесен вдясно, за да не пада върху окото.
  дипломна: () => `<g class="hat">
      <polygon points="85,84 150,54 215,84 150,114" fill="#101010"/>
      <rect x="122" y="88" width="56" height="16" rx="4" fill="#191919"/>
      <line x1="196" y1="84" x2="196" y2="114" stroke="#FFD54A" stroke-width="3"/>
      <circle cx="196" cy="117" r="5" fill="#FFD54A"/></g>`,
  каска: (c) => `<g class="hat">
      <path d="M104 92 C104 62 124 46 150 46 C176 46 196 62 196 92Z" fill="${c}"/>
      <path d="M116 88 C116 66 132 54 148 54 C136 60 124 72 122 88Z" fill="#ffffff" opacity=".3"/>
      <path d="M96 92 h108 a8 8 0 0 1-8 12 h-92 a8 8 0 0 1-8-12Z" fill="${shade(c, -.32)}"/>
      <rect x="146" y="40" width="8" height="16" rx="4" fill="${shade(c, .4)}"/></g>`,
  корона: (c) => `<g class="hat">
      <path d="M110 88 L110 48 L130 66 L150 40 L170 66 L190 48 L190 88Z" fill="#e8c34a"/>
      <circle cx="110" cy="42" r="6" fill="${c}"/><circle cx="150" cy="32" r="7" fill="${c}"/>
      <circle cx="190" cy="42" r="6" fill="${c}"/></g>`,
  качулка: (c) => `<g class="hat">
      <path d="M78 116 C78 68 110 44 150 44 C190 44 222 68 222 116 l0 14 C214 96 186 76 150 76
               C114 76 86 96 78 130Z" fill="#12161f"/>
      <path d="M88 122 C90 82 116 62 150 62 C184 62 210 82 212 122 C202 96 178 82 150 82
               C122 82 98 96 88 122Z" fill="${shade(c, -.6)}"/></g>`,
  слушалки: (c) => `<g class="hat">
      <path d="M84 122 C84 78 112 54 150 54 C188 54 216 78 216 122" fill="none" stroke="#2b3242" stroke-width="11"/>
      <rect x="72" y="112" width="22" height="40" rx="11" fill="${c}"/>
      <rect x="206" y="112" width="22" height="40" rx="11" fill="${c}"/></g>`,
  барета: (c) => `<g class="hat" transform="rotate(-8 150 80)">
      <path d="M100 92 C100 62 122 48 152 48 C186 48 208 60 208 82 C208 94 186 100 154 100
               C122 100 100 98 100 92Z" fill="${c}"/>
      <path d="M116 86 C116 66 134 56 154 56 C140 62 128 72 126 88Z" fill="#ffffff" opacity=".32"/>
      <path d="M100 92 C112 100 186 102 208 82 C208 92 186 102 154 102 C122 102 100 98 100 92Z"
            fill="${shade(c, -.32)}"/>
      <circle cx="152" cy="42" r="7" fill="${shade(c, -.38)}"/></g>`,
};

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

// Тялото е пътят от образеца (Body.tsx) — по-мек и по-„желеобразен" от моя предишен.
const BODY = "M150 66 C108 66 78 100 74 146 C70 185 82 228 112 250 C128 262 140 268 150 268 " +
  "C160 268 172 262 188 250 C218 228 230 185 226 146 C222 100 192 66 150 66Z";

export function mascotSvg(agent) {
  const c = agent.accent || "#7c6cf0";
  const id = agent.id.replace(/[^a-z0-9-]/gi, "");
  const [propName, hatName] = LOOK[agent.id] || FALLBACK_LOOK;
  const prop = (PROPS[propName] || PROPS["показалка"])(shade(c, .38));
  const hat = (HATS[hatName] || HATS["няма"])(c);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"
     role="img" aria-label="${agent.name}">
  <title>${agent.name} — ${agent.title || ""}</title>
  <defs>
    <radialGradient id="body-${id}" cx="35%" cy="28%">
      <stop offset="0%" stop-color="${shade(c, .78)}"/>
      <stop offset="35%" stop-color="${shade(c, .45)}"/>
      <stop offset="72%" stop-color="${c}"/>
      <stop offset="100%" stop-color="${shade(c, -.38)}"/>
    </radialGradient>
    <radialGradient id="inner-${id}">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bottom-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${c}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${shade(c, -.5)}"/>
    </linearGradient>
    <filter id="soft-${id}"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="shadow-${id}">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="${shade(c, -.55)}" flood-opacity=".35"/>
    </filter>
  </defs>
  <style>
    .float{animation:mascotFloat 5s ease-in-out infinite;transform-origin:150px 170px}
    .halo{animation:haloPulse 3s ease-in-out infinite;transform-origin:150px 160px}
    .eye{animation:blink 5s infinite;transform-origin:center}
    @keyframes mascotFloat{
      0%,100%{transform:translateY(0) rotate(-1deg)}
      25%{transform:translateY(-4px) rotate(.6deg)}
      50%{transform:translateY(-8px) rotate(1deg)}
      75%{transform:translateY(-4px) rotate(-.6deg)}}
    @keyframes haloPulse{0%,100%{opacity:.35;transform:scale(.92)}50%{opacity:.8;transform:scale(1.06)}}
    @keyframes blink{0%,47%{transform:scaleY(1)}49%,51%{transform:scaleY(.08)}53%,100%{transform:scaleY(1)}}
    @media (prefers-reduced-motion:reduce){.float,.halo,.eye{animation:none}}
  </style>

  <ellipse class="halo" cx="150" cy="160" rx="88" ry="104" fill="${c}" opacity=".18" filter="url(#soft-${id})"/>

  <g class="float">
    <path d="M212 196 q22 -6 34 -18" fill="none" stroke="${shade(c, -.3)}" stroke-width="17" stroke-linecap="round"/>
    <g transform="translate(214,148) scale(.52)">${prop}</g>

    <path filter="url(#shadow-${id})" fill="url(#body-${id})" d="${BODY}"/>
    <path opacity=".28" fill="url(#bottom-${id})" d="M88 195 C104 246 132 266 150 268 C168 266 196 246 212 195Z"/>
    <ellipse cx="118" cy="118" rx="22" ry="42" fill="url(#inner-${id})" opacity=".45" transform="rotate(-18 118 118)"/>
    <ellipse cx="165" cy="92" rx="10" ry="16" fill="#ffffff" opacity=".35"/>
    <ellipse cx="172" cy="150" rx="42" ry="64" fill="#ffffff" opacity=".05"/>

    <ellipse cx="102" cy="176" rx="10" ry="5" fill="#ffffff" opacity=".08"/>
    <ellipse cx="198" cy="176" rx="10" ry="5" fill="#ffffff" opacity=".08"/>

    <g class="eye"><ellipse cx="125" cy="145" rx="10" ry="12" fill="#151515"/>
      <circle cx="122" cy="141" r="3" fill="#ffffff" opacity=".95"/>
      <circle cx="127" cy="147" r="1.2" fill="#ffffff" opacity=".55"/></g>
    <g class="eye"><ellipse cx="175" cy="145" rx="10" ry="12" fill="#151515"/>
      <circle cx="172" cy="141" r="3" fill="#ffffff" opacity=".95"/>
      <circle cx="177" cy="147" r="1.2" fill="#ffffff" opacity=".55"/></g>

    <g class="glasses" fill="none" stroke="#101010" stroke-width="6">
      <circle cx="125" cy="145" r="22"/><circle cx="175" cy="145" r="22"/>
      <path d="M147 145 h6" stroke-width="5"/>
    </g>
    <path d="M112 118 Q125 112 138 118" stroke="${shade(c, -.78)}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M162 118 Q175 112 188 118" stroke="${shade(c, -.78)}" stroke-width="4" stroke-linecap="round" fill="none"/>

    <path d="M122 186 Q150 205 178 186" stroke="${shade(c, -.78)}" stroke-width="5" stroke-linecap="round" fill="none"/>

    <polygon points="144,215 118,203 118,227" fill="#10201a"/>
    <polygon points="156,215 182,203 182,227" fill="#10201a"/>
    <circle cx="150" cy="215" r="6" fill="#0F1E17"/>
    ${hat}
  </g>
</svg>
`;
}

/** React компонент — същата анатомия, но с проп за цвят, за продуктите ни на React. */
export function reactComponent(agents) {
  const looks = agents.map((a) => `  "${a.id}": { color: "${a.accent}", name: ${JSON.stringify(a.name)} },`).join("\n");
  return `// Mascot.tsx — АВТОГЕНЕРИРАН от tools/agents/mascots.mjs. Не редактирай на ръка.
// Анатомията е по образеца на собственика; цветът идва от акцента на агента в agents.json.
import "./Mascot.css";

export const AGENTS = {
${looks}
} as const;

export type AgentId = keyof typeof AGENTS;

type MascotProps = { agent?: AgentId; size?: number; color?: string };

/** Изсветлява/потъмнява hex — същата логика като в генератора. */
function shade(hex: string, t: number): string {
  const s = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  const m = t >= 0 ? 255 : 0, k = Math.abs(t);
  const to = (v: number) => Math.round(v + (m - v) * k).toString(16).padStart(2, "0");
  return \`#\${to(r)}\${to(g)}\${to(b)}\`;
}

export default function Mascot({ agent, size = 260, color }: MascotProps) {
  const main = color ?? (agent ? AGENTS[agent].color : "#3CFF77");
  const uid = agent ?? "default";
  return (
    <div className="mascot" style={{ ["--size" as string]: \`\${size}px\`, ["--main" as string]: main }}>
      <svg width={size} height={size} viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
           role="img" aria-label={agent ? AGENTS[agent].name : "Маскот"}>
        <defs>
          <radialGradient id={\`body-\${uid}\`} cx="35%" cy="28%">
            <stop offset="0%" stopColor={shade(main, .78)} />
            <stop offset="35%" stopColor={shade(main, .45)} />
            <stop offset="72%" stopColor={main} />
            <stop offset="100%" stopColor={shade(main, -.38)} />
          </radialGradient>
          <radialGradient id={\`inner-\${uid}\`}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={\`soft-\${uid}\`}><feGaussianBlur stdDeviation="12" /></filter>
          <filter id={\`shadow-\${uid}\`}>
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={shade(main, -.55)} floodOpacity=".35" />
          </filter>
        </defs>

        <ellipse cx="150" cy="160" rx="88" ry="104" fill={main} opacity=".18" filter={\`url(#soft-\${uid})\`} />
        <path filter={\`url(#shadow-\${uid})\`} fill={\`url(#body-\${uid})\`}
              d="${BODY}" />
        <ellipse cx="118" cy="118" rx="22" ry="42" fill={\`url(#inner-\${uid})\`} opacity=".45"
                 transform="rotate(-18 118 118)" />
        <ellipse cx="165" cy="92" rx="10" ry="16" fill="white" opacity=".35" />

        <g className="eye left-eye">
          <ellipse cx="125" cy="145" rx="10" ry="12" fill="#151515" />
          <circle cx="122" cy="141" r="3" fill="#fff" opacity=".95" />
        </g>
        <g className="eye right-eye">
          <ellipse cx="175" cy="145" rx="10" ry="12" fill="#151515" />
          <circle cx="172" cy="141" r="3" fill="#fff" opacity=".95" />
        </g>

        <g className="mascot-glasses" fill="none" stroke="#101010" strokeWidth="6">
          <circle cx="125" cy="145" r="22" /><circle cx="175" cy="145" r="22" />
          <path d="M147 145 h6" strokeWidth="5" />
        </g>
        <path d="M112 118 Q125 112 138 118" stroke={shade(main, -.62)} strokeWidth="4"
              strokeLinecap="round" fill="none" />
        <path d="M162 118 Q175 112 188 118" stroke={shade(main, -.62)} strokeWidth="4"
              strokeLinecap="round" fill="none" />
        <path d="M122 186 Q150 205 178 186" stroke={shade(main, -.66)} strokeWidth="5"
              strokeLinecap="round" fill="none" />

        <polygon points="128,215 112,205 112,225" fill="#0F1E17" />
        <polygon points="172,215 188,205 188,225" fill="#0F1E17" />
        <circle cx="150" cy="215" r="6" fill="#0F1E17" />
      </svg>
    </div>
  );
}
`;
}

/** Mascot.css — сиянието следва --main, вместо да е зашито в зелено. */
export const MASCOT_CSS = `/* АВТОГЕНЕРИРАН от tools/agents/mascots.mjs. Не редактирай на ръка.
   Разликата спрямо образеца: drop-shadow слоевете четат --main, затова всеки агент свети в СВОЯ
   цвят, вместо всички да са зелени. color-mix дава прозрачност без да режем hex-а на ръка. */
.mascot{
  width:var(--size);height:var(--size);
  display:flex;justify-content:center;align-items:center;position:relative;
  animation:mascotFloat 5s ease-in-out infinite;
}
.mascot svg{
  overflow:visible;
  filter:
    drop-shadow(0 0 8px color-mix(in srgb,var(--main) 45%,transparent))
    drop-shadow(0 0 22px color-mix(in srgb,var(--main) 25%,transparent))
    drop-shadow(0 0 40px color-mix(in srgb,var(--main) 15%,transparent));
  transition:transform .35s ease,filter .35s ease;
}
.mascot:hover svg{
  transform:translateY(-5px) scale(1.03);
  filter:
    drop-shadow(0 0 12px color-mix(in srgb,var(--main) 65%,transparent))
    drop-shadow(0 0 30px color-mix(in srgb,var(--main) 45%,transparent))
    drop-shadow(0 0 70px color-mix(in srgb,var(--main) 25%,transparent));
}
@keyframes mascotFloat{
  0%,100%{transform:translateY(0) rotate(-1deg)}
  25%{transform:translateY(-6px) rotate(.6deg)}
  50%{transform:translateY(-12px) rotate(1deg)}
  75%{transform:translateY(-6px) rotate(-.6deg)}
}
.mascot::before{
  content:"";position:absolute;inset:20%;border-radius:50%;
  background:radial-gradient(circle,color-mix(in srgb,var(--main) 28%,transparent),transparent 70%);
  filter:blur(35px);animation:pulse 3s ease-in-out infinite;pointer-events:none;
}
@keyframes pulse{0%,100%{opacity:.35;transform:scale(.9)}50%{opacity:.8;transform:scale(1.08)}}
.mascot::after{
  content:"";position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
  width:52%;height:18px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(10px);
  animation:shadowFloat 5s ease-in-out infinite;
}
@keyframes shadowFloat{0%,100%{width:52%;opacity:.45}50%{width:44%;opacity:.25}}
.eye{transform-origin:center;animation:blink 5s infinite}
.left-eye,.right-eye{animation-delay:.2s}
@keyframes blink{0%,47%{transform:scaleY(1)}49%,51%{transform:scaleY(.08)}53%,100%{transform:scaleY(1)}}
.mascot-glasses{transition:transform .25s ease;transform-origin:center}
.mascot:hover .mascot-glasses{transform:translateY(-1px)}
.mascot-glasses circle{transition:stroke .3s ease}
.mascot:hover .mascot-glasses circle{stroke:#2d2d2d}
/* Движението е украса, не смисъл — изключва се, когато потребителят го е поискал. */
@media (prefers-reduced-motion:reduce){
  .mascot,.mascot::before,.mascot::after,.eye{animation:none}
  .mascot svg,.mascot:hover svg{transition:none;transform:none}
}
`;

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
function agents() {
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  return reg.agents || reg;
}
const artifacts = (list) => [
  ...list.map((a) => [`${a.id}.svg`, mascotSvg(a)]),
  ["Mascot.tsx", reactComponent(list)],
  ["Mascot.css", MASCOT_CSS],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = agents();
  const want = artifacts(list);
  if (CHECK) {
    const missing = want.filter(([f]) => !existsSync(join(OUT_DIR, f))).map(([f]) => f);
    const stale = want.filter(([f, body]) => existsSync(join(OUT_DIR, f)) &&
      readFileSync(join(OUT_DIR, f), "utf8") !== body).map(([f]) => f);
    const known = new Set(want.map(([f]) => f));
    const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => !known.has(f)) : [];
    if (missing.length || stale.length || extra.length) {
      if (missing.length) console.error(`  липсват: ${missing.join(", ")}`);
      if (stale.length) console.error(`  застояли (генераторът дава друго): ${stale.join(", ")}`);
      if (extra.length) console.error(`  сирачета: ${extra.join(", ")}`);
      console.error("\n\x1b[31m✗ маскоти: разсинхрон.\x1b[0m Пусни: node tools/agents/mascots.mjs");
      process.exit(1);
    }
    console.log(`\x1b[32m✓ маскоти: ${list.length} агента + React компонент, всички сверени.\x1b[0m`);
    process.exit(0);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [f, body] of want) writeFileSync(join(OUT_DIR, f), body);
  console.log(`\x1b[32m✓ записани ${list.length} маскота + Mascot.tsx/.css\x1b[0m → agents-dashboard/mascots/`);
}
