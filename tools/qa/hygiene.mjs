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
//
// Термометърът не лъже (21.11.2026): първият облачен преглед сложи на върха adblock и SupremeDiscordBot с
// ~2 900 „дублирани“ реда, а те бяха шум — генериран бандъл с „DO NOT EDIT“ и огледала в отделни Docker
// контексти, пазени от тест байт по байт. Затова: генерираното по заглавие се пропуска; цели еднакви файлове
// са „огледала“ (под тест или БЕЗ тест — второто остава сигнал); тестовете се броят и като `*-test.mjs`/
// `*.test.php`; продукт, който CI пуска през static-site-check, е „статичен“, не „0 тестове“.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isTestFile } from "../lib/audit-patterns.mjs";
import { isMain } from "../lib/is-main.mjs";

export const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".mts", ".cts"]);
export const BLOCK = 8;
export const BIG = 600;
const MAX_BYTES = 300_000;
const GENERATED = /(^|\/)(dist|build|out|\.next|coverage|vendor|generated|public)\/|\.min\.|\.d\.ts$|(^|\/)prisma\/migrations\//;

/** Генериран файл: „GENERATED … DO NOT EDIT“ или `@generated` в първите 5 реда (заглавието, не споменаване). */
export function isGenerated(text) {
  const head = text.split("\n", 5).join("\n");
  return /@generated\b/.test(head) || (/\bgenerated\b/i.test(head) && /\bdo not edit\b/i.test(head));
}

/** Тест за доклада: общото правило + `*-test.mjs`/`*_test.js`/`selftest.mjs` и PHP (`*.test.php`, `*Test.php`). */
export function isHygieneTest(p) {
  return isTestFile(p) || /(^|\/)[^/]*[-_]test\.(m?js|cjs|ts)$/.test(p) || /(^|\/)selftest\.(m?js|ts)$/.test(p) || /\.test\.php$|(^|\/)[A-Z][A-Za-z0-9]*Test\.php$/.test(p);
}

/** Продуктът се гейтва в CI през static-site-check (статичен сайт без собствени тестове). */
export function staticGated(product, workflows) {
  const re = new RegExp(`static-site-check\\.mjs\\s+${product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "m");
  return Object.values(workflows).some((t) => re.test(t));
}

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

const relOf = (p) => p.split("/").slice(1).join("/");
const noExt = (p) => p.slice(0, p.length - extname(p).length);

/** Копието е назовано от тест: пълният път без разширение или папката (≥3 нива) + името на файла. */
function namedByTest(path, testTexts) {
  const rel = relOf(path), dir = dirname(rel), base = noExt(basename(rel));
  return testTexts.some((t) => t.includes(noExt(rel)) || (dir.split("/").length >= 3 && t.includes(dir) && t.includes(base)));
}

/** Огледала: цели файлове с еднакво значещо съдържание (≥ BLOCK реда) на различни места. */
export function mirrorGroups(src, testTexts) {
  const by = new Map();
  for (const f of src) {
    const rows = f.text.split("\n").map(normalize).filter(Boolean);
    if (rows.length < BLOCK) continue;
    const h = createHash("sha1").update(rows.join("\n")).digest("hex");
    by.set(h, [...(by.get(h) || []), f.path]);
  }
  return [...by.values()].filter((g) => g.length > 1).map((at) => ({ at, guarded: at.filter((p) => namedByTest(p, testTexts)).length >= at.length - 1 }));
}

/** Отчет за един продукт от списък { path, text }. */
export function productReport(files, { top = 5, staticGate = false } = {}) {
  const ours = files.filter((f) => !GENERATED.test(f.path));
  const generated = ours.filter((f) => CODE_EXT.has(extname(f.path)) && isGenerated(f.text));
  const code = ours.filter((f) => CODE_EXT.has(extname(f.path)) && !isGenerated(f.text));
  const tests = ours.filter((f) => isHygieneTest(f.path) && (CODE_EXT.has(extname(f.path)) || extname(f.path) === ".php"));
  const src = code.filter((f) => !isHygieneTest(f.path));
  const mirrors = mirrorGroups(src, tests.map((t) => t.text));
  const copies = new Set(mirrors.flatMap((m) => m.at.slice(1)));
  const uniq = src.filter((f) => !copies.has(f.path)); // всяко огледало веднъж
  const debt = [];
  for (const f of uniq) f.text.split("\n").forEach((l, i) => { if (isDebt(l)) debt.push(`${f.path}:${i + 1}`); });
  const big = uniq.map((f) => ({ at: f.path, lines: f.text.split("\n").length })).filter((x) => x.lines > BIG).sort((a, b) => b.lines - a.lines);
  const dups = duplicateBlocks(uniq);
  return {
    files: src.length, tests: tests.length, testRatio: src.length ? +(tests.length / src.length).toFixed(2) : 0, static: staticGate,
    generated: generated.length,
    debt: debt.length, debtAt: debt.slice(0, top),
    big: big.length, bigAt: big.slice(0, top),
    dups: dups.length, dupLines: dups.reduce((a, d) => a + d.lines, 0), dupAt: dups.slice(0, top),
    mirrors: mirrors.length, mirrorsUnguarded: mirrors.filter((m) => !m.guarded).length,
    mirrorAt: mirrors.sort((a, b) => Number(a.guarded) - Number(b.guarded)).slice(0, top),
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

/** Текстовете на CI workflow-ите (за статичните продукти). Липсваща папка → празно. */
function workflows(root) {
  const dir = join(root, ".github", "workflows");
  try { return Object.fromEntries(readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, readFileSync(join(dir, f), "utf8")])); } catch { return {}; }
}

function load(root, product) {
  const out = [];
  for (const p of tracked(root, product)) {
    if ((!CODE_EXT.has(extname(p)) && !(extname(p) === ".php" && isHygieneTest(p))) || GENERATED.test(p)) continue;
    try { if (statSync(join(root, p)).size > MAX_BYTES) continue; out.push({ path: p, text: readFileSync(join(root, p), "utf8") }); } catch { /* изтрит в работното дърво */ }
  }
  return out;
}

function main(argv) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const root = process.env.HYGIENE_ROOT || process.cwd();
  const top = Number(val("--top")) || 5;
  const list = val("--product") ? [val("--product")] : products(root);
  const wfs = workflows(root);
  const rows = list.map((p) => ({ product: p, ...productReport(load(root, p), { top, staticGate: staticGated(p, wfs) }) })).filter((r) => r.files);
  if (argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log("продукт            файлове  тестове/изх.  дълг  големи(>" + BIG + ")  дубли(блокове · реда)  огледала(без тест)");
  const ratio = (r) => (r.static && !r.tests ? "статичен" : String(r.testRatio));
  for (const r of rows) console.log(`${r.product.padEnd(18)} ${String(r.files).padStart(7)}  ${ratio(r).padStart(11)}  ${String(r.debt).padStart(4)}  ${String(r.big).padStart(11)}  ${String(r.dups).padStart(6)} · ${String(r.dupLines).padEnd(6)}  ${r.mirrors}(${r.mirrorsUnguarded})`);
  const join3 = (at) => `${at.slice(0, 3).join(" ↔ ")}${at.length > 3 ? ` (+${at.length - 3})` : ""}`;
  for (const r of rows) {
    if (!r.debt && !r.big && !r.dups && !r.mirrors) continue;
    console.log(`\n${r.product}:`);
    for (const m of r.mirrorAt) console.log(`  ${m.guarded ? "огледало (под тест)" : "огледало БЕЗ тест за паритет"}: ${join3(m.at)}`);
    for (const d of r.dupAt) console.log(`  дубъл ${d.lines} реда: ${join3(d.at)}`);
    for (const b of r.bigAt) console.log(`  голям: ${b.at} (${b.lines} реда)`);
    for (const t of r.debtAt) console.log(`  дълг: ${t}`);
  }
  const gen = rows.reduce((a, r) => a + r.generated, 0);
  if (gen) console.log(`\nГенерирани файлове (пропуснати, заглавие „DO NOT EDIT“): ${gen} — ${rows.filter((r) => r.generated).map((r) => `${r.product} ${r.generated}`).join(", ")}.`);
  console.log("\nСигнали, не присъда: Качествения решава кое е дълг и кое е съзнателно (умение improve-codebase-architecture).");
  console.log("Огледало БЕЗ тест за паритет е сигнал: копията дрейфват тихо. Огледало под тест е съзнателно.");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
