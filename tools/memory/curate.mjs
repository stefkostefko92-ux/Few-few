#!/usr/bin/env node
// tools/memory/curate.mjs — пазач срещу дрейф/подуване на паметта (v6.0).
//
// Употреба:
//   node tools/memory/curate.mjs            # dry-run: какво би направил
//   node tools/memory/curate.mjs --write    # приложи дедуп + капване
//
// За всеки .claude/agents/_memory/<id>.md:
//  - маха дублирани bullet-и (по нормализиран текст) в „Проверени поуки" и „Карантина";
//  - капва всяка секция до MAX (пази най-новите отгоре), излишъкът → архивна бележка;
//  - маркира ВЪЗМОЖНИ противоречия (висока прилика между две поуки) за ЧОВЕШКО решение —
//    не трие и не презаписва мълчаливо (закон: противоречие → стоп).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const MEM_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents", "_memory");
const MAX_PER_SECTION = 80; // 10.0-агентите легитимно държат 60+ проверени поуки — не архивирай истинско знание
const SIM_THRESHOLD = 0.6; // Jaccard над това → вероятно дублат/противоречие
const STALE_DAYS = 45; // време-чувствителна поука по-стара от това → флаг за повторна проверка
const WRITE = process.argv.includes("--write");

// Време-чувствителни факти (версии, „latest", дати, API дати) гният — flawlessness #8 (TTL/provenance).
const TIME_SENSITIVE = /верси|latest|текущ|\bv?\d+\.\d+|\b20\d\d\b|API \d|stable|release/i;
function lessonDate(bullet) { const m = bullet.match(/\*\*(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; }
function daysSince(d) { return (Date.now() - new Date(d + "T00:00:00Z").getTime()) / 86400000; }

const SECTIONS = ["Проверени поуки", "Карантина"];

function norm(s) {
  return s.toLowerCase().replace(/\*\*/g, "").replace(/[`'"„“”]/g, "").replace(/_\(.*?\)_/g, "")
    .replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
}
function tokens(s) { return new Set(norm(s).split(" ").filter((w) => w.length > 3)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function sectionBounds(lines, heading) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return { start, end };
}

let totalDup = 0, totalCap = 0, totalConflict = 0, totalStale = 0;

for (const f of readdirSync(MEM_DIR).filter((x) => x.endsWith(".md") && x !== "PROTOCOL.md")) {
  const file = join(MEM_DIR, f);
  let lines = readFileSync(file, "utf8").split("\n");
  let changed = false;
  const report = [];

  for (const heading of SECTIONS) {
    const b = sectionBounds(lines, heading);
    if (!b) continue;
    const body = lines.slice(b.start + 1, b.end);
    const bullets = body.filter((l) => l.trim().startsWith("- "));
    const nonBullets = body.filter((l) => !l.trim().startsWith("- "));

    // дедуп (пази първото срещане = най-новото отгоре)
    const seen = new Set(), deduped = [];
    for (const bl of bullets) { const n = norm(bl); if (seen.has(n)) { totalDup++; changed = true; continue; } seen.add(n); deduped.push(bl); }

    // противоречия/близки дублати (докладвай, не трий)
    for (let i = 0; i < deduped.length; i++)
      for (let j = i + 1; j < deduped.length; j++)
        if (jaccard(deduped[i], deduped[j]) >= SIM_THRESHOLD) { report.push(`  ⚠ близки (${heading}): \n     • ${deduped[i].trim()}\n     • ${deduped[j].trim()}`); totalConflict++; }

    // застарели време-чувствителни проверени факти → флаг за повторна проверка (не трий)
    if (heading === "Проверени поуки")
      for (const bl of deduped) {
        const d = lessonDate(bl);
        if (d && TIME_SENSITIVE.test(bl) && daysSince(d) > STALE_DAYS) {
          report.push(`  ⏳ застаряло (${Math.round(daysSince(d))}д, ${d}): ${bl.trim().slice(0, 110)}…`); totalStale++;
        }
      }

    // капване
    let capped = deduped, overflow = [];
    if (deduped.length > MAX_PER_SECTION) { capped = deduped.slice(0, MAX_PER_SECTION); overflow = deduped.slice(MAX_PER_SECTION); totalCap += overflow.length; changed = true; }

    const newBody = [...nonBullets.filter((l) => l.trim() && !/архивирани/.test(l)), ...capped];
    if (overflow.length) newBody.push(`\n_(${overflow.length} по-стари поуки архивирани при curate ${new Date().toISOString().slice(0, 10)}.)_`);
    lines = [...lines.slice(0, b.start + 1), ...newBody, ...lines.slice(b.end)];
  }

  if (report.length) console.log(`\n${f}:`), report.forEach((r) => console.log(r));
  if (changed && WRITE) writeFileSync(file, lines.join("\n")), console.log(`  ✎ записан ${f}`);
}

console.log(`\ncurate: ${totalDup} дубли, ${totalCap} капнати, ${totalConflict} за преглед (противоречия), ${totalStale} застарели (>${STALE_DAYS}д, време-чувствителни).` +
  (WRITE ? " [записано]" : " [dry-run — добави --write за прилагане]"));
process.exit(0);
