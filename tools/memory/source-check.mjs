#!/usr/bin/env node
// source-check.mjs — проверените поуки, чийто източник в репото вече не съществува.
//
// Защо (2026-11-11): „The components of agent memory“ (Anthropic, 06.11.2026) — бележките се сверяват с
// оригинала периодично („dreaming“). Нашата памет пази `confidence` + `source` + карантина, но никой не
// гледаше дали `source:` още сочи нещо: файлът се мести или трие, редът изтича. Поука с мъртъв източник
// изглежда проверена, а вече не може да бъде пресверена.
//
//   node tools/memory/source-check.mjs                 # доклад по агенти (L1: само доклад, изход 0)
//   node tools/memory/source-check.mjs --agent kodadjiyata
//   node tools/memory/source-check.mjs --json
//
// Гледа САМО раздела „Проверени поуки“ и САМО пътища под истинска папка от репото (URL-и, чужди репа и
// команди не се пипат). Не трие и не мести нищо: мъртвият източник е кандидат за пресверка от агента
// (`promote.mjs` / `memory-freshness`), решението е на човека.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../lib/is-main.mjs";

const ROOT = process.env.SOURCE_CHECK_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERIFIED = /^##\s+Проверени поуки/;
const EXT = "(?:mjs|cjs|js|ts|tsx|jsx|md|json|jsonl|ya?ml|sh|ejs|prisma|css|html|py|sql|toml|conf|service|txt)";

/** Източникът на поука: текстът след „verified;“ в последните `_( … )_`. */
export function sourceOf(line) {
  const i = line.lastIndexOf("_(");
  if (i < 0) return null;
  const inner = line.slice(i + 2).replace(/\)_\s*$/, "");
  const m = inner.match(/(?:^|;)\s*verified\s*;\s*([\s\S]+)$/);
  return m ? m[1].trim() : null;
}

/** Пътища под истинска папка от репото, с ред (или края на диапазон). */
export function repoRefs(source, topDirs) {
  const out = [];
  const re = new RegExp(String.raw`(?:^|[\s(\x60„"'])((?:\.?[\w-]+)(?:/[\w.@-]+)*\.` + EXT + String.raw`)(?::(\d+)(?:-(\d+))?)?(?=$|[\s),;\x60"'“]|:)`, "g");
  for (const m of String(source).matchAll(re)) {
    const path = m[1];
    if (!topDirs.has(path.split("/")[0]) || !path.includes("/") || path.includes("node_modules/")) continue; // зависимостите не са в репото
    out.push({ path, line: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null });
  }
  return out;
}

/** Мъртвите от тях: липсващ файл или ред след края. */
export function deadRefs(refs, root = ROOT) {
  const dead = [];
  for (const r of refs) {
    const f = join(root, r.path);
    if (!existsSync(f) || !statSync(f).isFile()) { dead.push({ ...r, problem: "липсва файлът" }); continue; }
    if (r.line) {
      const n = readFileSync(f, "utf8").split("\n").length - 1;
      if (r.line > n) dead.push({ ...r, problem: `ред ${r.line} > ${n} реда` });
    }
  }
  return dead;
}

function topDirsOf(root) {
  const s = new Set();
  for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && e.name !== ".git" && e.name !== "node_modules") s.add(e.name);
  return s;
}

/** По агент: колко поуки, колко сочат файл от репото, кои са мъртви. */
export function scan(root = ROOT, { agent = null } = {}) {
  const dir = join(root, ".claude", "agents", "_memory");
  const top = topDirsOf(root);
  const files = readdirSync(dir).filter((f) => /^[a-z0-9-]+\.md$/.test(f) && f === f.toLowerCase());
  const res = [];
  for (const f of files) {
    const id = f.replace(/\.md$/, "");
    if (agent && id !== agent) continue;
    let inVerified = false, lessons = 0, withRefs = 0;
    const dead = [];
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (/^##\s/.test(line)) { inVerified = VERIFIED.test(line); continue; }
      if (!inVerified || !/^- \*\*\d{4}-\d{2}-\d{2}/.test(line)) continue;
      lessons++;
      const src = sourceOf(line);
      const refs = src ? repoRefs(src, top) : [];
      if (!refs.length) continue;
      withRefs++;
      const date = line.match(/\d{4}-\d{2}-\d{2}/)[0];
      for (const d of deadRefs(refs, root)) dead.push({ date, ...d });
    }
    if (lessons) res.push({ agent: id, lessons, withRefs, dead });
  }
  return res;
}

function main(argv) {
  const ai = argv.indexOf("--agent");
  const r = scan(ROOT, { agent: ai >= 0 ? argv[ai + 1] : null });
  const dead = r.reduce((s, a) => s + a.dead.length, 0);
  if (argv.includes("--json")) { process.stdout.write(JSON.stringify({ dead, agents: r }, null, 2) + "\n"); return; }
  const lessons = r.reduce((s, a) => s + a.lessons, 0), withRefs = r.reduce((s, a) => s + a.withRefs, 0);
  console.log(`source-check: ${lessons} проверени поуки · ${withRefs} сочат файл от репото · ${dead} мъртви източника`);
  for (const a of r.filter((x) => x.dead.length)) {
    console.log(`\n${a.agent} (${a.dead.length}):`);
    for (const d of a.dead.slice(0, 15)) console.log(`  - ${d.date} · ${d.path}${d.line ? ":" + d.line : ""} — ${d.problem}`);
    if (a.dead.length > 15) console.log(`  … още ${a.dead.length - 15}`);
  }
  if (dead) console.log("\n↳ кандидати за пресверка от агента (promote.mjs) — нищо не е изтрито.");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
