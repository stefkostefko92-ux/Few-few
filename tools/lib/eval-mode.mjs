#!/usr/bin/env node
// eval-mode.mjs — временен режим за живи проверки на агентите (2026-09-23).
//
// Защо: живата проверка пуска реални агенти върху ИЗМИСЛЕН вход (заложен бъг във файл от пробата). Без режим:
//  - паметта записва „поуки" за код, който не съществува;
//  - дневникът на веригите (_flows.jsonl, проследен в git) получава фалшиви вериги;
//  - дневникът за употреба смесва проверки с продукционни пускания и изкривява цената;
//  - няма как да се пусне вариант „без лична памет", за да се види дали паметта помага.
// Режимът е файл в .git (никога в commit) с изтичане: забравен режим не оставя флота без памет —
// след най-много MAX_MINUTES куките го игнорират сами.
//
//   node tools/lib/eval-mode.mjs on --label mem-off --memory off [--minutes 90]
//   node tools/lib/eval-mode.mjs status | off

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_FILE = "agents-eval.json";
export const MAX_MINUTES = 180;

function evalPath(cwd) {
  const r = spawnSync("git", ["rev-parse", "--git-path", EVAL_FILE], { cwd, encoding: "utf8" });
  if (r.status !== 0) return null;
  const p = r.stdout.trim();
  return isAbsolute(p) ? p : join(cwd, p);
}

/** Активният режим или null (липсва, повреден или изтекъл). `memory` е "on" | "off". */
export function evalMode(cwd, now = Date.now()) {
  const p = evalPath(cwd);
  if (!p) return null;
  try {
    const m = JSON.parse(readFileSync(p, "utf8"));
    const until = Date.parse(m.until);
    if (!Number.isFinite(until) || until <= now) return null;
    return { label: String(m.label || "eval").slice(0, 40), memory: m.memory === "off" ? "off" : "on", until: m.until };
  } catch { return null; }
}

export function setEvalMode(cwd, { label = "eval", memory = "on", minutes = 60 } = {}, now = Date.now()) {
  const p = evalPath(cwd);
  if (!p) throw new Error("не е git хранилище");
  const min = Math.max(1, Math.min(MAX_MINUTES, Number(minutes) || 60));
  const rec = { label: String(label).slice(0, 40), memory: memory === "off" ? "off" : "on", until: new Date(now + min * 60_000).toISOString() };
  writeFileSync(p, JSON.stringify(rec) + "\n");
  return rec;
}

export function clearEvalMode(cwd) {
  const p = evalPath(cwd);
  if (p) rmSync(p, { force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv[0] === "on") {
    const r = setEvalMode(cwd, { label: val("--label"), memory: val("--memory"), minutes: val("--minutes") });
    console.log(`режим за проверка: „${r.label}“ · лична памет ${r.memory === "off" ? "ИЗКЛЮЧЕНА" : "включена"} · до ${r.until} (записът на памет е спрян)`);
  } else if (argv[0] === "off") {
    clearEvalMode(cwd);
    console.log("режимът за проверка е изключен");
  } else {
    const m = evalMode(cwd);
    console.log(m ? `активен: „${m.label}“ · памет ${m.memory} · до ${m.until}` : "няма активен режим за проверка");
  }
}
