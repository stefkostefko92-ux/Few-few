#!/usr/bin/env node
// fonts.mjs — самостоятелно хостване на шрифтовете (нула заявки към Google в продукция).
// Чете семействата от хъба и демотата, взима CSS-а на Google Fonts с модерен UA (woff2 +
// unicode-range), сваля само нужните подмножества (latin · latin-ext · cyrillic · cyrillic-ext) в
// public/fonts/ и пише по един CSS файл на семейство в src/assets/fonts/. Пуска се РЪЧНО при смяна
// на шрифт; резултатът е проследен в git.
//   node tools/fonts.mjs            # семействата на демотата
//   node tools/fonts.mjs --brand    # бранд шрифтовете → src/assets/fonts/brand.css
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMOS } from "../src/demos/index.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_FONTS = join(ROOT, "public/fonts");
const OUT_CSS = join(ROOT, "src/assets/fonts");
mkdirSync(OUT_FONTS, { recursive: true }); mkdirSync(OUT_CSS, { recursive: true });
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const SUBSETS = new Set(["latin", "latin-ext", "cyrillic", "cyrillic-ext"]);

import { fontSlug as slug } from "../src/lib/html.mjs";
// Бранд семействата (хъб · цени · правна · лентата на демотата) → ЕДИН файл brand.css: езикът на
// „Двубой в Рейвънхолд“ (boy/template.html) — Alegreya за заглавия, Alegreya Sans за текст, Alegreya Sans SC
// за етикети. Grenze Gotisch на boy няма кирилица, затова заглавията са в калиграфската Alegreya.
const BRAND = ["Alegreya:wght@500..800", "Alegreya+Sans:wght@400", "Alegreya+Sans+SC:wght@500"];
const families = process.argv.includes("--brand") ? BRAND : [...new Set(DEMOS.flatMap((d) => d.theme.fonts))];
let brandCss = "/* brand.css — генерирано от tools/fonts.mjs --brand (Google Fonts, OFL): Alegreya · Alegreya Sans · Alegreya Sans SC */\n";

for (const fam of families) {
  const url = `https://fonts.googleapis.com/css2?family=${fam}&display=optional`; // optional: без смяна на шрифта след първия рендер → нула CLS от текст (Lighthouse съвет)
  const css = await (await fetch(url, { headers: { "user-agent": UA } })).text();
  const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)];
  let out = `/* ${fam.split(":")[0].replace(/\+/g, " ")} — генерирано от tools/fonts.mjs (Google Fonts, OFL) */\n`;
  let n = 0;
  for (const [, subset, body] of blocks) {
    if (!SUBSETS.has(subset)) continue;
    const src = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!src) continue;
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1].trim().replace(/\s+/g, "-") ?? "400";
    const style = body.match(/font-style:\s*([^;]+);/)?.[1].trim() ?? "normal";
    const file = `${slug(fam)}-${style}-${weight}-${subset}.woff2`;
    const dest = join(OUT_FONTS, file);
    if (!existsSync(dest)) writeFileSync(dest, Buffer.from(await (await fetch(src)).arrayBuffer()));
    out += `@font-face {${body.replace(/url\([^)]+\)\s*format\('woff2'\)/, `url(/fonts/${file}) format('woff2')`)}}\n`;
    n++;
  }
  if (!n) throw new Error(`нула подмножества за ${fam}`);
  if (families === BRAND) brandCss += out.split("\n").slice(1).join("\n");
  else writeFileSync(join(OUT_CSS, `${slug(fam)}.css`), out);
  console.log(`✓ ${fam.split(":")[0].replace(/\+/g, " ")} — ${n} файла`);
}
if (families === BRAND) writeFileSync(join(OUT_CSS, "brand.css"), brandCss);
