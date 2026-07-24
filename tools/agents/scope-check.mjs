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

const INFRA = new Set(["tools", ".claude", ".github", ".githooks", "agents-dashboard", "deploy", "docs"]);

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

function runCli() {
  const argv = process.argv.slice(2);
  let files;
  if (argv.includes("--staged")) files = gitFiles("--cached");
  else if (argv.includes("--range")) files = gitFiles(argv[argv.indexOf("--range") + 1] || "origin/main..HEAD");
  else if (argv.length) files = argv.filter((a) => !a.startsWith("--"));
  else files = gitFiles("HEAD");
  const r = checkScope(files);
  if (r.ok) { console.log(`✓ scope-check: ${r.products.length ? `един продукт (${r.products[0]})` : "само инфраструктура"} — законът „one project per change" е спазен.`); process.exit(0); }
  console.log(`✗ scope-check: промяната пипа ${r.products.length} продукта: ${r.products.join(", ")}`);
  console.log(`  Монорепо закон №1: един продукт на промяна. Раздели на отделни клонове/PR-и —`);
  console.log(`  смесването чупи path-филтрирания CI и прави diff-а неревюируем.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
