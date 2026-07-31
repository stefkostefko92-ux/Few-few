#!/usr/bin/env node
// build.mjs — генерира `react/JellyMascot.tsx` от файловете в `svg/`.
//
// ЗАЩО генератор, а не втори ръчно написан вариант: една и съща геометрия, преписана на две
// места, се разминава при първата поправка — SVG-то се оправя, компонентът остава със стария
// път и никой не забелязва, защото и двата „работят". Тук истината е ЕДНА (`svg/*.svg`);
// компонентът е производен и `check.mjs` пада, ако е ръчно пипан (regenerate-and-diff).
//
//   node build.mjs            # записва react/JellyMascot.tsx
//   node build.mjs --stdout   # само печата (ползва се от check.mjs)

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TIERS = ["full", "medium", "icon"];

/** Атрибути, които в JSX не се преименуват (namespace-и и a11y). */
const KEEP_AS_IS = /^(aria-|data-|xmlns)/;

/** kebab-case → camelCase за JSX (`stroke-width` → `strokeWidth`). */
export function jsxAttrName(name) {
  if (KEEP_AS_IS.test(name)) return name;
  if (name === "class") return "className";
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Прави id-тата уникални за инстанцията. Два маскота на една страница споделят документ —
 * без префикс вторият краде `url(#jm-body)` на първия и се боядисва с чужд градиент.
 * Връща JSX стойност: или обикновен низ в кавички, или template literal в скоби.
 */
export function jsxAttrValue(name, value) {
  const needsUid = name === "id" || /url\(#/.test(value) || (name === "aria-labelledby" && /jm-/.test(value));
  if (!needsUid) return `"${value}"`;
  let v = value;
  if (name === "id") v = "${uid}-" + value.replace(/^jm[mi]?-/, "");
  else if (name === "aria-labelledby") v = value.split(/\s+/).map((t) => "${uid}-" + t.replace(/^jm[mi]?-/, "")).join(" ");
  else v = value.replace(/url\(#(jm[mi]?-)?([\w-]+)\)/g, (_, __, id) => "url(#${uid}-" + id + ")");
  return "{`" + v + "`}";
}

/** Вътрешността на `<svg>` → JSX. Работи върху нашите файлове (без CDATA, без `>` в стойност). */
export function svgBodyToJsx(svg, indent = "      ") {
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const stripped = inner.replace(/<title[\s\S]*?<\/title>\s*/g, "").replace(/<desc[\s\S]*?<\/desc>\s*/g, "");

  const out = stripped.replace(/<!--([\s\S]*?)-->/g, (_, body) => {
    if (body.includes("*/")) throw new Error("коментар с `*/` не може да стане JSX коментар");
    return `{/*${body}*/}`;
  }).replace(/<([a-zA-Z]+)((?:\s+[:\w-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, (_, tag, attrs, selfClose) => {
    const parts = [...attrs.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)].map(([, n, v]) => {
      if (/[<>{}]/.test(v)) throw new Error(`стойност с JSX-опасен знак: ${n}="${v}"`);
      return `${jsxAttrName(n)}=${jsxAttrValue(n, v)}`;
    });
    return `<${tag}${parts.length ? " " + parts.join(" ") : ""}${selfClose ? "/" : ""}>`;
  });

  const lines = out.split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const base = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => (l.trim() ? indent + l.slice(base) : "")).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Анимационният блок от `tokens.css` — вграден дословно, за да е компонентът самодостатъчен. */
export function animationCss(css) {
  const m = css.match(/\/\* @animation:start[\s\S]*?\*\/\n([\s\S]*?)\n\/\* @animation:end \*\//);
  if (!m) throw new Error("липсват маркерите @animation:start/@animation:end в tokens.css");
  return m[1].trim();
}

/**
 * Пълното ниво + анимацията, вградена като `<style>` вътре в самия SVG.
 *
 * Защо съществува: външният CSS не стига до `<img src="…svg">`, значи анимацията работи само при
 * ВГРАДЕН SVG. Продуктите, които не могат да вграждат (EJS партиали, статични страници, README),
 * иначе получават неподвижна картинка. Тук стиловете пътуват ВЪТРЕ във файла и се движи навсякъде.
 */
export function animatedSvg(fullSvg, css) {
  if (!fullSvg.includes("</defs>")) throw new Error("пълният SVG няма <defs> — няма къде да влезе стилът");
  return fullSvg
    .replace(/^<svg /, '<svg class="jm-animated" ')
    .replace("<title", "<!-- ⚠️  ГЕНЕРИРАН ФАЙЛ — не го редактирай на ръка.\n       Източник: svg/jelly-mascot-full.svg + tokens.css · Генератор: `node build.mjs` -->\n  <title")
    .replace("</defs>", `</defs>\n\n  <style>\n${css.split("\n").map((l) => (l.trim() ? "    " + l : "")).join("\n")}\n  </style>`);
}

/**
 * Социална карта 1200×630 (og:image / Twitter card) — маскотът вляво, свободно поле вдясно.
 *
 * Защо генерирана: всеки продукт иска предпросмотър за споделяне и всеки път някой изнася PNG на
 * ръка от текущата версия. Тук картата е ПРОИЗВОДНА на пълното ниво — сменя се маскотът, сменя се
 * и картата, без ръчен експорт. Текстът НЕ е вграден: заглавието е на продукта, не на асета
 * (и шрифт в SVG не се пренася надеждно) — оставено е място вдясно, върху което продуктът пише.
 */
export function socialCard(fullSvg) {
  const inner = fullSvg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title[\s\S]*?<\/title>\s*/g, "")
    .replace(/<desc[\s\S]*?<\/desc>\s*/g, "")
    .trim()
    .split("\n")
    .map((l) => (l.trim() ? "    " + l : ""))
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-labelledby="jm-card-title jm-card-desc">
  <!-- ⚠️  ГЕНЕРИРАН ФАЙЛ — не го редактирай на ръка.
       Източник: svg/jelly-mascot-full.svg · Генератор: \`node build.mjs\` -->
  <title id="jm-card-title">Маскотът на Carbon Stealth — карта за споделяне</title>
  <desc id="jm-card-desc">Тъмна карта 1200 на 630 пиксела: светещото желирано маскотче вляво и свободно поле вдясно за заглавие на продукта.</desc>

  <defs>
    <radialGradient id="jm-card-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="var(--jm-neon, #5AB60D)" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="var(--jm-neon, #5AB60D)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="jm-card-line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--jm-olive, #99E72A)" stop-opacity="0.85"/>
      <stop offset="1" stop-color="var(--jm-olive, #99E72A)" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="var(--jm-bg, #050706)"/>
  <ellipse cx="350" cy="330" rx="470" ry="360" fill="url(#jm-card-glow)"/>
  <rect x="700" y="300" width="360" height="3" rx="1.5" fill="url(#jm-card-line)"/>

  <g transform="translate(78 46) scale(1.05)">
${inner}
  </g>
</svg>
`;
}

export function generate(read = (p) => readFileSync(join(HERE, p), "utf8")) {
  const tiers = Object.fromEntries(TIERS.map((t) => [t, svgBodyToJsx(read(`svg/jelly-mascot-${t}.svg`))]));
  const css = animationCss(read("tokens.css"));
  if (/[`$]/.test(css)) throw new Error("CSS с ` или $ би счупил template literal-а в компонента");

  return `// ⚠️  ГЕНЕРИРАН ФАЙЛ — не го редактирай на ръка.
//     Източник: mascot/svg/*.svg + mascot/tokens.css  ·  Генератор: \`node mascot/build.mjs\`
//     \`node mascot/check.mjs\` пада, ако този файл се разминава с източника.
//
// Маскотът на Carbon Stealth: полупрозрачно желирано телце с очила, папийонка и академична шапка.
// Нула зависимости извън React. Копирай папката \`react/\` в продукта, който го ползва.
import { useId, type CSSProperties, type ReactElement } from "react";

export type JellyMascotDetail = "full" | "medium" | "icon";

export interface JellyMascotProps {
  /** Ниво на детайл: \`full\` (герой), \`medium\` (среден размер/печат), \`icon\` (≤32 px, favicon). */
  detail?: JellyMascotDetail;
  /** Страна на квадратния кадър в CSS пиксели (или всяка валидна CSS дължина). */
  size?: number | string;
  /**
   * Достъпно име. Подай текст, когато маскотът НОСИ смисъл (лого, илюстрация с роля).
   * Подай \`null\`, когато е чиста декорация — тогава излиза \`aria-hidden\` и екранният четец мълчи.
   */
  title?: string | null;
  /** Черен герой-фон вътре в SVG-то (както е в референцията). По подразбиране: прозрачен. */
  background?: "none" | "black";
  /** Микро-анимация (полюшване, пулс на глоуто, мигане, махане на пискюла). */
  animated?: boolean;
  className?: string;
  /** Пребоядисване по бранд: подай CSS променливите \`--jm-*\` (виж \`tokens.json\`). */
  style?: CSSProperties;
}

/** Анимацията живее в \`mascot/tokens.css\` и се вгражда тук, за да е компонентът самодостатъчен. */
const ANIMATION_CSS = \`
${css}
\`;

interface TierProps {
  uid: string;
}

${TIERS.map((t) => `function ${t[0].toUpperCase() + t.slice(1)}({ uid }: TierProps) {\n  return (\n    <>\n${tiers[t]}\n    </>\n  );\n}`).join("\n\n")}

const TIERS: Record<JellyMascotDetail, (p: TierProps) => ReactElement> = { full: Full, medium: Medium, icon: Icon };

export default function JellyMascot({
  detail = "full",
  size = 256,
  title = "Маскотът на Carbon Stealth",
  background = "none",
  animated = false,
  className,
  style,
}: JellyMascotProps) {
  // Всяка инстанция получава свои id-та — иначе втори маскот на страницата краде градиентите на първия.
  const uid = \`jm\${useId().replace(/[^a-zA-Z0-9_-]/g, "")}\`;
  const Tier = TIERS[detail];
  const decorative = title === null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={[animated ? "jm-animated" : "", className].filter(Boolean).join(" ") || undefined}
      style={style}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : \`\${uid}-title\`}
    >
      {!decorative && <title id={\`\${uid}-title\`}>{title}</title>}
      {animated && <style>{ANIMATION_CSS}</style>}
      {background === "black" && <rect width="512" height="512" fill="var(--jm-bg, #050706)" />}
      <Tier uid={uid} />
    </svg>
  );
}
`;
}

/** Анимираният SVG от текущите източници (същият вход като `generate`). */
export function generateAnimatedSvg(read = (p) => readFileSync(join(HERE, p), "utf8")) {
  return animatedSvg(read("svg/jelly-mascot-full.svg"), animationCss(read("tokens.css")));
}

/** Социалната карта от текущите източници. */
export function generateSocialCard(read = (p) => readFileSync(join(HERE, p), "utf8")) {
  return socialCard(read("svg/jelly-mascot-full.svg"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = generate();
  if (process.argv.includes("--stdout")) process.stdout.write(code);
  else {
    writeFileSync(join(HERE, "react/JellyMascot.tsx"), code);
    writeFileSync(join(HERE, "svg/jelly-mascot-full-animated.svg"), generateAnimatedSvg());
    writeFileSync(join(HERE, "svg/social-card.svg"), generateSocialCard());
    console.log("✓ генерирани: react/JellyMascot.tsx · svg/jelly-mascot-full-animated.svg · svg/social-card.svg");
  }
}
