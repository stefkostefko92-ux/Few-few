#!/usr/bin/env node
/**
 * Сглобява ръководството „Как протича всяка игра“ в PDF.
 *
 *   node docs/gameflow/build.mjs            # → docs/gameflow/aso-gameflow.pdf
 *
 * Източници: src/*.html (по една глава на игра, HTML фрагменти), снимки от
 * истински мачове в img/ с надписи в img/captions.json. Печата се с Chromium
 * (Playwright): шрифтът Inter/DejaVu носи кирилицата, номерата на страниците
 * са в долния колонтитул.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../apps/web/package.json"));
const { chromium } = require("@playwright/test");

const PARTS = [
  { title: "Общото за всички игри", keys: ["00-common"] },
  { title: "Карти", keys: ["belote", "santase", "bridge", "kent", "svara", "war", "gofish", "rummy"] },
  { title: "Плочки и билети", keys: ["domino", "bingo"] },
  { title: "Дъски и зарове", keys: ["chess", "draughts", "backgammon", "ludo", "dice", "magnat"] },
  { title: "Билярд", keys: ["eightball", "nineball", "snooker"] },
  { title: "Мрежи и думи", keys: ["battleship", "words"] },
];

const read = (p) => fs.readFileSync(p, "utf8");
const captions = fs.existsSync(path.join(here, "img/captions.json"))
  ? JSON.parse(read(path.join(here, "img/captions.json")))
  : {};

const figure = (f) =>
  `<figure class="${f.narrow ? "narrow" : ""}"><img src="img/${f.file}" alt=""><figcaption>${f.caption}</figcaption></figure>`;

const figBlock = (fs_) => `<div class="figs ${fs_.length === 1 ? "one" : "many"}">${fs_.map(figure).join("")}</div>`;

/** Снимките на главата. Маркер `<!--fig:a.jpg,b.jpg-->` в главата слага тези
 *  снимки точно там; останалите отиват заедно в общия блок. */
function figures(key, html) {
  const list = (captions[key] ?? []).filter((f) => fs.existsSync(path.join(here, "img", f.file)));
  const used = new Set();
  html = html.replace(/<!--fig:([^>]+?)-->/g, (_, names) => {
    const picked = names.split(",").map((n) => list.find((f) => f.file === n.trim())).filter(Boolean);
    picked.forEach((f) => used.add(f.file));
    return picked.length ? figBlock(picked) : "";
  });
  const rest = list.filter((f) => !used.has(f.file));
  return { html, block: rest.length ? figBlock(rest) : "" };
}

const chapters = [];
const toc = [];
for (const part of PARTS) {
  const present = part.keys.filter((k) => fs.existsSync(path.join(here, "src", `${k}.html`)));
  if (!present.length) continue;
  const partId = `p-${chapters.length}`;
  chapters.push(`<div class="part" id="${partId}"><span>Част</span><h1>${part.title}</h1></div>`);
  const items = [];
  for (const key of present) {
    let html = read(path.join(here, "src", `${key}.html`));
    const title = (html.match(/<h2>([\s\S]*?)<\/h2>/) ?? [])[1]?.trim() ?? key;
    const id = (html.match(/<section[^>]*id="([^"]+)"/) ?? [])[1] ?? `g-${key}`;
    // Снимките идват след таблицата с фактите (или след въведението).
    const placed = figures(key, html);
    html = placed.html;
    const figs = placed.block;
    if (figs) {
      const at = html.indexOf("</table>");
      const lead = html.indexOf("</p>");
      const pos = at !== -1 ? at + "</table>".length : lead !== -1 ? lead + 4 : -1;
      html = pos === -1 ? html + figs : html.slice(0, pos) + figs + html.slice(pos);
    }
    chapters.push(html);
    items.push(`<li><a href="#${id}">${title}</a></li>`);
  }
  toc.push(`<li class="toc-part"><a href="#${partId}">${part.title}</a><ol>${items.join("")}</ol></li>`);
}

let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: here }).toString().trim();
} catch {
  /* извън git */
}
const today = new Date().toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" });

const page = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8"><title>АСО — как протича всяка игра</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  :root { --ink:#1d1a16; --muted:#5c5446; --brass:#9a7426; --brass-l:#f3e7c9; --line:#e2d8c2; --warn:#a3291f; }
  * { box-sizing: border-box; }
  html { font-family: "Inter", "DejaVu Sans", sans-serif; font-size: 10.2pt; color: var(--ink); line-height: 1.5; }
  body { margin: 0; }
  a { color: inherit; text-decoration: none; }
  .cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .kicker { letter-spacing: .18em; text-transform: uppercase; color: var(--brass); font-weight: 700; font-size: 10pt; }
  .cover h1 { font-family: "DejaVu Serif", serif; font-size: 34pt; line-height: 1.1; margin: 8mm 0 6mm; }
  .cover p { font-size: 12pt; color: var(--muted); max-width: 150mm; }
  .cover .meta { margin-top: 14mm; font-size: 9.5pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 4mm; }
  .toc { page-break-after: always; }
  .toc h1 { font-family: "DejaVu Serif", serif; font-size: 20pt; margin: 0 0 6mm; }
  .toc > ol { list-style: none; padding: 0; columns: 2; column-gap: 12mm; }
  .toc-part { break-inside: avoid; margin-bottom: 5mm; }
  .toc-part > a { font-weight: 700; color: var(--brass); text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; }
  .toc-part ol { margin: 1.5mm 0 0; padding-left: 5mm; }
  .toc-part li { margin: .8mm 0; }
  .part { page-break-before: always; height: 230mm; display: flex; flex-direction: column; justify-content: center; }
  .part span { color: var(--brass); letter-spacing: .2em; text-transform: uppercase; font-weight: 700; }
  .part h1 { font-family: "DejaVu Serif", serif; font-size: 30pt; margin: 3mm 0 0; }
  section.game { page-break-before: always; }
  section.game h2 { font-family: "DejaVu Serif", serif; font-size: 22pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid var(--brass); }
  section.game h3 { font-size: 12.5pt; margin: 6mm 0 2mm; color: var(--brass); break-after: avoid; }
  section.game h4 { font-size: 10.8pt; margin: 4mm 0 1.5mm; break-after: avoid; }
  p.lead { font-size: 11.2pt; color: var(--muted); margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.4pt; break-inside: auto; }
  th, td { border: 1px solid var(--line); padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
  thead th { background: var(--brass-l); }
  table.facts th, table.facts td:first-child { background: #faf6ec; font-weight: 600; width: 34%; }
  tr { break-inside: avoid; }
  ol.steps { counter-reset: st; list-style: none; padding-left: 0; }
  ol.steps > li { counter-increment: st; position: relative; padding-left: 9mm; margin: 0 0 2.2mm; break-inside: avoid; }
  ol.steps > li::before { content: counter(st); position: absolute; left: 0; top: .1em; width: 6mm; height: 6mm; border-radius: 50%; background: var(--brass); color: #fff; font-size: 8.5pt; font-weight: 700; display: grid; place-items: center; line-height: 6mm; text-align: center; }
  ul, ol { padding-left: 6mm; }
  li { margin: .8mm 0; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.8pt; background: #f4efe3; padding: 0 1mm; border-radius: 2px; }
  blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid var(--brass); background: #faf6ec; }
  .note { background: #f1f6fb; border-left: 3px solid #4d7fae; padding: 2mm 4mm; margin: 3mm 0; break-inside: avoid; }
  .warn { background: #fbf0ee; border-left: 3px solid var(--warn); padding: 2mm 4mm; margin: 3mm 0; break-inside: avoid; }
  .figs { display: flex; flex-wrap: wrap; gap: 4mm; margin: 3mm 0 4mm; justify-content: center; }
  figure { margin: 0; flex: 0 0 calc(50% - 2mm); break-inside: avoid; }
  .figs.one figure { flex-basis: 80%; }
  figure.narrow { flex: 0 0 52mm; }
  figure img { width: 100%; border: 1px solid var(--line); border-radius: 2mm; display: block; }
  figcaption { font-size: 8.6pt; color: var(--muted); margin-top: 1mm; }
</style></head>
<body>
  <div class="cover">
    <div class="kicker">АСО · Carbon Stealth VCC</div>
    <h1>Как протича всяка игра</h1>
    <p>Стъпка по стъпка: от лобито и търсенето на съперник през всяка фаза, всеки бутон и всяко решение до края на мача — за всичките 21 игри.</p>
    <div class="meta">Описанието е по самия код на играта (двигател, сървър, екран) — версия ${commit || "—"}, ${today}.</div>
  </div>
  <nav class="toc"><h1>Съдържание</h1><ol>${toc.join("")}</ol></nav>
  ${chapters.join("\n")}
</body></html>`;

const outHtml = path.join(here, "aso-gameflow.html");
fs.writeFileSync(outHtml, page);
const exe = process.env.PW_CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe });
const tab = await browser.newPage();
await tab.goto(`file://${outHtml}`, { waitUntil: "load" });
const outPdf = path.join(here, "aso-gameflow.pdf");
await tab.pdf({
  path: outPdf,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-family:DejaVu Sans,sans-serif;font-size:8px;color:#8a8170;padding:0 15mm;display:flex;justify-content:space-between"><span>АСО — как протича всяка игра</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
});
await browser.close();
fs.rmSync(outHtml);
console.log(`✓ ${path.relative(process.cwd(), outPdf)}`);
