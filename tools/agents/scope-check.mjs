#!/usr/bin/env node
// scope-check.mjs — налага монорепо закон №1: „One project per change" (scope-creep детектор).
// Идея от awesome-llm-apps (scope-creep-detector), написана НАШИЯ начин: zero-dep, динамичен
// списък (без твърдо вписани продукти → без drift), fail-closed по избор.
//
// Продукт = top-level папка, която НЕ е инфраструктурна (tools/.claude/.github/agents-dashboard/
// deploy/docs/.githooks). Промяна, пипаща ≥2 продуктови папки = нарушение — смесени deps/toolchain,
// счупен path-филтриран CI, неревюируем diff.
//
//   node tools/agents/scope-check.mjs --staged          # индексираните промени (пре-commit)
//   node tools/agents/scope-check.mjs --range A..B      # диапазон (пре-PR: origin/main..HEAD)
//   node tools/agents/scope-check.mjs f1 f2 …           # явен списък файлове (за тестове/hook)
//
// Изход: 0 = един продукт (или само инфра); 1 = scope creep. Инфра+1 продукт е ОК (CI на продукта).

import { execSync } from "node:child_process";

// `research/` е документация (пазарни проучвания), не продукт: няма deps, няма CI, няма ред в
// продуктовата таблица на кореновия CLAUDE.md. Без него гейтът броеше проучването и продукта,
// който то обосновава, за „два продукта" и хващаше несъществуващ scope-creep (PR #163).
const INFRA = new Set(["tools", ".claude", ".github", ".githooks", "agents-dashboard", "deploy", "docs", "research"]);

// Чиста логика — тестваема: списък файлове → {products:[…], infra:bool, ok}.
// `root` (по избор): репо-коренът — АБСОЛЮТНИТЕ пътища се релативизират спрямо него, преди да се
// разцепят. Без това Write подава абсолютен път (/home/.../Few-few/medqr/x) → `seg[0]=""` и всички
// пътища попадат в един празен „продукт" → гейтът е no-op. (Red-team F1, razbivacha 2026-07-24.)
export function checkScope(files, root) {
  const products = new Set();
  let infra = false;
  const rootPrefix = root ? String(root).replace(/\/+$/, "") + "/" : null;
  for (const f0 of files) {
    let f = String(f0).replace(/^\.\//, "");
    if (rootPrefix && f.startsWith(rootPrefix)) f = f.slice(rootPrefix.length); // абсолютен под корена → релативен
    if (f.startsWith("/") || f.startsWith("../")) { infra = true; continue; }   // абсолютен извън корена / escape → не мислабелвай като продукт „"/„.."
    const seg = f.split("/");
    if (seg.length < 2 || seg[0] === "") { infra = true; continue; }            // root файл (CLAUDE.md) или празен сегмент = инфра
    if (INFRA.has(seg[0])) { infra = true; continue; }
    products.add(seg[0]);
  }
  return { products: [...products].sort(), infra, ok: products.size <= 1 };
}

function gitFiles(args) {
  try { return execSync(`git diff --name-only ${args}`, { encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { console.error(`git diff провал: ${e.message}`); process.exit(2); }
}

const gitOk = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };

/**
 * Кой diff да съдим по подразбиране.
 *
 * ДЕФЕКТЪТ, който това затваря: по подразбиране инструментът правеше `git diff HEAD` — тоест само
 * НЕКОМИТНАТИТЕ промени — докато CI пуска `--range origin/<base>...HEAD`, тоест ЦЕЛИЯ PR. След
 * комит локалният ран нямаше какво да види и весело обявяваше „само инфраструктура", а CI за същия
 * клон валеше нарушение. Гейт, който отговаря различно на двете места, е по-лош от липсващ — точно
 * на този фалшив зелен се доверих и сгреших (2026-07-29, PR #147).
 *
 * Сега по подразбиране се съди СЪЩОТО като в CI. Ако няма база (плитък клон, откачена глава),
 * падаме назад и КАЗВАМЕ на какво сме паднали — режимът никога не се избира мълчаливо.
 */
export const BASES = ["origin/main", "origin/master", "main", "master"];

// `hasBase` е ИНЖЕКТИРУЕМ, за да е логиката тестваема детерминистично. Първата версия на теста
// твърдеше „режимът е range" и падна в CI, защото `actions/checkout` прави плитък клон и
// `origin/main` там не съществува — тоест тестът проверяваше ОБКРЪЖЕНИЕТО, не логиката. Точно
// анти-патърнът, който изчиствам другаде: проверка, вързана за ambient състояние.
export function defaultRange(hasBase = (b) => gitOk(`git rev-parse --verify --quiet ${b}`) && gitOk(`git merge-base ${b} HEAD`)) {
  for (const base of BASES) {
    if (hasBase(base)) return { mode: "range", args: `${base}...HEAD`, label: `клонът спрямо ${base} (както в CI)` };
  }
  return { mode: "worktree", args: "HEAD", label: "САМО некомитнатите промени (няма база за сравнение!)" };
}

function runCli() {
  const argv = process.argv.slice(2);
  let files, label;
  if (argv.includes("--staged")) { files = gitFiles("--cached"); label = "staged файловете"; }
  else if (argv.includes("--range")) {
    const rng = argv[argv.indexOf("--range") + 1] || "origin/main...HEAD";
    files = gitFiles(rng); label = `диапазон ${rng}`;
  } else if (argv.filter((a) => !a.startsWith("--")).length) {
    files = argv.filter((a) => !a.startsWith("--")); label = `${files.length} подадени файла`;
  } else {
    const d = defaultRange();
    files = gitFiles(d.args); label = d.label;
  }
  // Винаги казвай КАКВО си мерил. Мълчаливият избор на режим е причината този гейт да подведе.
  console.log(`\x1b[90mscope-check съди: ${label} · ${files.length} файла\x1b[0m`);
  const r = checkScope(files);
  if (r.ok) { console.log(`✓ scope-check: ${r.products.length ? `един продукт (${r.products[0]})` : "само инфраструктура"} — законът „one project per change" е спазен.`); process.exit(0); }
  console.log(`✗ scope-check: промяната пипа ${r.products.length} продукта: ${r.products.join(", ")}`);
  console.log(`  Монорепо закон №1: един продукт на промяна. Раздели на отделни клонове/PR-и —`);
  console.log(`  смесването чупи path-филтрирания CI и прави diff-а неревюируем.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
