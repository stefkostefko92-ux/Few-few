#!/usr/bin/env node
// learning-batch.mjs — маркер „тече партида учене“ (напр. прегледите на всички отворени PR-и).
//
// Защо (2026-10-27): artifact-sync връщаше сесията на всяко спиране, докато 123 прегледа учеха агентите —
// паметта се местеше на всеки няколко минути и артефактът на флота се републикуваше десет пъти за час,
// без човек да го гледа. Решението на собственика („учене ⇒ артефактът се обновява винаги“) иска артефакт
// СЛЕД ученето, не по време на него. Докато маркерът е активен, artifact-sync само напомня; след края му
// (или изтичането) връщането е както преди. Файлът е в общата .git папка (виждат го и копията), никога в
// commit, с изтичане — забравен маркер не спира правилото за дълго.
//
//   node tools/lib/learning-batch.mjs on --label pr-review [--minutes 120]
//   node tools/lib/learning-batch.mjs status | off

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BATCH_FILE = "agents-learning-batch.json";
export const MAX_MINUTES = 240;

function batchPath(cwd) {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return null;
  const d = r.stdout.trim();
  return join(isAbsolute(d) ? d : join(cwd, d), BATCH_FILE);
}

/** Активната партида или null (липсва, повредена, изтекла или с край отвъд тавана). */
export function activeBatch(cwd, now = Date.now()) {
  const p = batchPath(cwd);
  if (!p) return null;
  try {
    const b = JSON.parse(readFileSync(p, "utf8"));
    const until = Date.parse(b.until);
    if (!Number.isFinite(until) || until <= now || until > now + MAX_MINUTES * 60_000) return null;
    return { label: String(b.label || "партида").slice(0, 40), until: b.until };
  } catch { return null; }
}

export function startBatch(cwd, { label = "партида", minutes = 120 } = {}, now = Date.now()) {
  const p = batchPath(cwd);
  if (!p) throw new Error("не е git хранилище");
  const min = Math.max(1, Math.min(MAX_MINUTES, Number(minutes) || 120));
  const rec = { label: String(label).slice(0, 40), until: new Date(now + min * 60_000).toISOString() };
  writeFileSync(p, JSON.stringify(rec) + "\n");
  return rec;
}

export function endBatch(cwd) {
  const p = batchPath(cwd);
  if (p) rmSync(p, { force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [cmd] = process.argv.slice(2);
  const val = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
  if (cmd === "on") { const b = startBatch(cwd, { label: val("--label") || "партида", minutes: val("--minutes") }); console.log(`✓ партида „${b.label}“ до ${b.until}`); }
  else if (cmd === "off") { endBatch(cwd); console.log("✓ партидата е затворена"); }
  else { const b = activeBatch(cwd); console.log(b ? `партида „${b.label}“ до ${b.until}` : "няма активна партида"); }
}
