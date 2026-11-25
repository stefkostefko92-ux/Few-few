#!/usr/bin/env node
// format-on-edit.mjs — PostToolUse/Write|Edit|MultiEdit: prettier на продукта върху току-що редактирания файл.
//
// Защо (2026-11-11): Boris Cherny (създателят на Claude Code, 02.01.2026) — „A PostToolUse hook formats Claude's
// code … so CI doesn't fail on formatting“. При нас `format:check` е част от гейта на medqr, piuma, vizitka,
// Gaming…; форматът се хващаше чак там и струваше още един ход.
//
// Кога пуска: файлът е в продукт (първата папка на репото) с prettier конфиг И локален
// `<продукт>/node_modules/.bin/prettier`; разширението е код (не документация — markdown не се пипа, за да
// не се сменя пунктуацията на българските текстове); не е lock файл и не е под node_modules. Пуска само
// инсталирания в продукта prettier, никога npx/мрежа. Всяка грешка → пропуска тихо (изход 0): форматът е
// удобство, не защита; гейтът на продукта остава истината.
import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, relative, isAbsolute, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { isMain } from "../../tools/lib/is-main.mjs";

const CODE = /\.(?:m?js|cjs|jsx|ts|tsx|mts|cts|css|scss|less|json|vue|svelte|ya?ml|html)$/i;
const CONFIGS = [".prettierrc", ".prettierrc.json", ".prettierrc.yaml", ".prettierrc.yml", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.mjs", ".prettierrc.json5", ".prettierrc.toml", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs"];

function hasPrettierConfig(dir) {
  if (CONFIGS.some((c) => existsSync(join(dir, c)))) return true;
  try { return "prettier" in JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return false; }
}

/** Чиста логика: файл → { bin, cwd } или null. */
export function formatPlan(file, root) {
  if (!file || typeof file !== "string") return null;
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  const parts = rel.split(sep);
  if (parts.length < 2 || parts[0].startsWith(".") || parts.includes("node_modules") || parts.includes(".git")) return null;
  if (!CODE.test(abs) || /(?:^|[-.])lock\.(?:json|ya?ml)$/i.test(parts.at(-1))) return null;
  const cwd = join(root, parts[0]);
  const bin = join(cwd, "node_modules", ".bin", "prettier");
  if (!hasPrettierConfig(cwd) || !existsSync(bin)) return null;
  try { if (!statSync(abs).isFile() || statSync(abs).size > 1_000_000) return null; } catch { return null; }
  // Symlink към файл извън продукта → не: prettier --write пише през връзката.
  try { const real = relative(realpathSync(cwd), realpathSync(abs)); if (!real || real.startsWith("..") || isAbsolute(real)) return null; } catch { return null; }
  return { bin, cwd };
}

function main() {
  let p = {};
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (!["Write", "Edit", "MultiEdit"].includes(p.tool_name)) return;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const plan = formatPlan(p.tool_input?.file_path, root);
  if (!plan) return;
  spawnSync(plan.bin, ["--write", "--ignore-unknown", "--log-level", "warn", resolve(root, p.tool_input.file_path)], {
    cwd: plan.cwd, timeout: 15_000, stdio: "ignore",
  });
}

if (isMain(import.meta.url)) { try { main(); } catch { /* удобство, не защита */ } process.exit(0); }
