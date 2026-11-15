#!/usr/bin/env node
// tools/qa/hygiene.mjs — седмичен доклад за чистотата на кода по продукт (L1: само доклад, изход 0).
//
// Защо (2026-11-11): в Anthropic рутини по график гонят мъртъв код, дублирани шаблони и покритие
// (Boris Cherny — tools/research/boris-cherny.md, т. 12). При нас седмичният sweep пазеше само агентския
// слой; продуктовият код нямаше такъв поглед. Това е „ръката“ на Качествения за него.
//
// Сигнали (броими, с `файл:ред`; СИГНАЛИ, не присъда — присъдата е на Качествения):
//   дълг     — маркери TODO/FIXME/HACK в коментар на код
//   дубли    — еднакви блокове от ≥ BLOCK значещи реда в два или повече файла/места
//   големи   — файлове над BIG реда (кандидати за разделяне)
//   тестове  — тестови към изходни файлове (дълбочината е в tools/qa/test-audit.mjs)
// Съзнателно БЕЗ „неизползван файл“: страниците и маршрутите на Next.js, EJS изгледите и входните
// точки нямат import към себе си — лексикален скенер би ги обявил за мъртви и би удавил сигнала.
//
//   node tools/qa/hygiene.mjs [--product <папка>] [--top 5] [--json]
// Чете само следените от git файлове (без node_modules, билдове и генерирано).
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isTestFile } from "../lib/audit-patterns.mjs";
import { isMain } from "../lib/is-main.mjs";

export const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".mts", ".cts"]);
export const BLOCK = 8;
export const BIG = 600;
const MAX_BYTES = 300_000;
const GENERATED = /(^|\/)(dist|build|out|\.next|coverage|vendor|generated|public)\/|\.min\.|\.d\.ts$|(^|\/)prisma\/migrations\//;

/** Маркер за дълг в коментар — не в низ или идентификатор. */
export function isDebt(line) {
  const c = line.match(/(?:\/\/|\/\*|^\s*\*)(.*)$/);
  return !!c && /\b(TODO|FIXME|HACK)\b/.test(c[1]);
}

/** Значещ ред за сравнение на блокове: без празни, само скоби, import/export-from и коментари. */
export function normalize(line) {
  const t = line.trim().replace(/\s+/g, " ");
  if (t.length < 4 || /^[{}()[\];,]+$/.test(t) || /^(import\b|export \* from|export \{[^}]*\} from)/.test(t) || /^(\/\/|\/\*|\*)/.test(t)) return "";
  return t;
}

/** Дублирани блокове: files = [{ path, text }] → [{ lines, at: ["път:ред", …] }], най-дългите първи. */
export function duplicateBlocks(files, block = BLOCK) {
  const seq = files.map((f) => {
    const rows = [];
    f.text.split("\n").forEach((l, i) => { const n = normalize(l); if (n) rows.push({ n, line: i + 1 }); });
    return { path: f.path, rows };
  });
  const hashAt = (rows, i) => createHash("sha1").update(rows.slice(i, i + block).map((r) => r.n).join("\n")).digest("hex");
  const seen = new Map();
  for (const f of seq) for (let i = 0; i + block <= f.rows.length; i++) {
    const h = hashAt(f.rows, i);
    const list = seen.get(h) || [];
    list.push({ path: f.path, i });
    seen.set(h, list);
  }
  const dupKeys = new Set([...seen].filter(([, l]) => l.length > 1 && new Set(l.map((x) => `${x.path}:${Math.floor(x.i / block)}`)).size > 1).map(([h]) => h));
  // Последователните дублирани прозорци в един файл са ЕДИН блок; отчита се веднъж, от първото място.
  const out = [], reported = new Set();
  for (const f of seq) {
    let i = 0;
    while (i + block <= f.rows.length) {
      const h = hashAt(f.rows, i);
      if (!dupKeys.has(h)) { i++; continue; }
      let j = i; while (j + 1 + block <= f.rows.length && dupKeys.has(hashAt(f.rows, j + 1))) j++;
      if (!reported.has(h)) {
        const others = seen.get(h).filter((x) => !(x.path === f.path && x.i === i));
        for (const o of seen.get(h)) reported.add(hashAt(seq.find((s) => s.path === o.path).rows, o.i));
        out.push({ lines: j - i + block, at: [`${f.path}:${f.rows[i].line}`, ...others.map((o) => `${o.path}:${seq.find((s) => s.path === o.path).rows[o.i].line}`)] });
      }
      i = j + block;
    }
  }
  return out.sort((a, b) => b.lines - a.lines);
}

/** Отчет за един продукт от списък { path, text }. */
export function productReport(files, { top = 5 } = {}) {
  const code = files.filter((f) => CODE_EXT.has(extname(f.path)) && !GENERATED.test(f.path));
  const tests = code.filter((f) => isTestFile(f.path));
  const src = code.filter((f) => !isTestFile(f.path));
  const debt = [];
  for (const f of src) f.text.split("\n").forEach((l, i) => { if (isDebt(l)) debt.push(`${f.path}:${i + 1}`); });
  const big = src.map((f) => ({ at: f.path, lines: f.text.split("\n").length })).filter((x) => x.lines > BIG).sort((a, b) => b.lines - a.lines);
  const dups = duplicateBlocks(src);
  return {
    files: src.length, tests: tests.length, testRatio: src.length ? +(tests.length / src.length).toFixed(2) : 0,
    debt: debt.length, debtAt: debt.slice(0, top),
    big: big.length, bigAt: big.slice(0, top),
    dups: dups.length, dupLines: dups.reduce((a, d) => a + d.lines, 0), dupAt: dups.slice(0, top),
  };
}

function tracked(root, dir) {
  return execFileSync("git", ["ls-files", "-z", "--", dir], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean);
}

// Продукт = папка в корена със собствен CLAUDE.md (правило на репото). Не по package.json в корена:
// SupremeDiscordBot ги има само в backend/ и bot/ и така изпадаше от доклада.
export function productsOf(paths) {
  return paths.filter((p) => /^[^./][^/]*\/CLAUDE\.md$/.test(p)).map((p) => p.split("/")[0]);
}
const products = (root) => productsOf(tracked(root, "."));

function load(root, product) {
  const out = [];
  for (const p of tracked(root, product)) {
    if (!CODE_EXT.has(extname(p)) || GENERATED.test(p)) continue;
    try { if (statSync(join(root, p)).size > MAX_BYTES) continue; out.push({ path: p, text: readFileSync(join(root, p), "utf8") }); } catch { /* изтрит в работното дърво */ }
  }
  return out;
}

function main(argv) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const root = process.env.HYGIENE_ROOT || process.cwd();
  const top = Number(val("--top")) || 5;
  const list = val("--product") ? [val("--product")] : products(root);
  const rows = list.map((p) => ({ product: p, ...productReport(load(root, p), { top }) })).filter((r) => r.files);
  if (argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log("продукт            файлове  тестове/изх.  дълг  големи(>" + BIG + ")  дубли(блокове · реда)");
  for (const r of rows) console.log(`${r.product.padEnd(18)} ${String(r.files).padStart(7)}  ${String(r.testRatio).padStart(11)}  ${String(r.debt).padStart(4)}  ${String(r.big).padStart(11)}  ${String(r.dups).padStart(6)} · ${r.dupLines}`);
  for (const r of rows) {
    if (!r.debt && !r.big && !r.dups) continue;
    console.log(`\n${r.product}:`);
    for (const d of r.dupAt) console.log(`  дубъл ${d.lines} реда: ${d.at.slice(0, 3).join(" ↔ ")}${d.at.length > 3 ? ` (+${d.at.length - 3})` : ""}`);
    for (const b of r.bigAt) console.log(`  голям: ${b.at} (${b.lines} реда)`);
    for (const t of r.debtAt) console.log(`  дълг: ${t}`);
  }
  console.log("\nСигнали, не присъда: Качествения решава кое е дълг и кое е съзнателно (умение improve-codebase-architecture).");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
