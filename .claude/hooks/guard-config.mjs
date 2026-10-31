#!/usr/bin/env node
// guard-config.mjs — ConfigChange: настройка, сменена ПО СРЕДАТА на сесия, не може да отслаби
// предпазителите на същата сесия. Затягането минава; отслабването чака нова сесия (и ревю в PR).
//
// Защо (проучване 31.10.2026, AI-джията): инжекция, която накара агента да редактира
// `.claude/settings.json`, махаше guard-exfil или deny правило веднага — харнесът презарежда
// настройките в движение. ConfigChange с exit 2 спира прилагането в текущата сесия
// (https://code.claude.com/docs/en/hooks#configchange-decision-control). Блокът е мълчалив по дизайн
// на харнеса — затова всяко решение се записва в `_state/config-changes.jsonl`.
//
// Правила (детерминистично, без мрежа):
//   project_settings → сравнение с комитнатата версия (git HEAD): липсващо deny правило, липсваща
//                      кука, свален `onFailure: "block"`, изключена ограда за запис или
//                      `disableAllHooks` → блок. Неразбираем JSON → блок (старите настройки остават).
//   local_settings / user_settings → блок само при `disableAllHooks: true` (deny и куките се сливат
//                      от всички източници, затова друго отслабване оттам не е възможно).
//   skills           → блок винаги: умение, записано по време на сесия, влиза от следващата.
//   policy_settings  → харнесът не позволява блок; само запис.
//
// Договор: stdin = JSON {source, file_path}. Регистриран като ConfigChange (без matcher).
// Fail-closed: кука, която не тръгва, блокира (`onFailure: "block"`); вътрешна грешка → блок.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function hookCommands(s) {
  const out = [];
  for (const [event, groups] of Object.entries(s?.hooks || {})) {
    for (const g of groups || []) {
      for (const h of g.hooks || []) {
        const alts = g.matcher ? new Set(String(g.matcher).split("|")) : null; // null = всичко
        out.push({ event, alts, cmd: h.command ?? h.prompt ?? "", type: h.type, timeout: Number(h.timeout) || 60, block: h.onFailure === "block", key: `${event}|${g.matcher ?? ""}|${h.command ?? h.prompt ?? ""}` });
      }
    }
  }
  return out;
}

// Кука от HEAD е запазена, ако същата команда стои на същото събитие с matcher, който покрива
// всички стари алтернативи — разширеният matcher (Bash → Bash|Monitor) е затягане, не смяна.
function covers(cur, old) {
  if (cur.event !== old.event || cur.cmd !== old.cmd) return false;
  if (cur.alts === null) return true;
  if (old.alts === null) return false;
  for (const a of old.alts) if (!cur.alts.has(a)) return false;
  return true;
}

/** Причина за блок или null. `next`/`base` са разбрани обекти (base може да липсва). */
export function weakening(source, next, base) {
  if (next?.disableAllHooks === true) return "disableAllHooks: true изключва всички пазачи";
  // Червен екип 31.10.2026: от user settings `bypassPermissions` важи и маха deny правилата от сила;
  // `auto` прехвърля решенията на класификатор. Задава се на старта на сесия, не по средата ѝ.
  if (/^(bypassPermissions|auto)$/.test(String(next?.permissions?.defaultMode || ""))) return `defaultMode: ${next.permissions.defaultMode} по средата на сесия`;
  if (source !== "project_settings" || !base) return null;
  const deny = new Set(next?.permissions?.deny || []);
  const lost = (base.permissions?.deny || []).filter((r) => !deny.has(r));
  if (lost.length) return `махнато deny правило: ${lost.slice(0, 3).join(", ")}`;
  if (base.permissions?.blockWritesOutsideWorkingDirectories === true && next?.permissions?.blockWritesOutsideWorkingDirectories !== true)
    return "изключена ограда blockWritesOutsideWorkingDirectories";
  const now = hookCommands(next);
  for (const h of hookCommands(base)) {
    const kept = now.filter((c) => covers(c, h));
    if (!kept.length) return `махната или стеснена кука: ${h.key.slice(0, 120)}`;
    if (h.block && !kept.some((c) => c.block)) return `свален onFailure: "block" от ${h.key.slice(0, 120)}`;
    // Кука, която не стига да довърши, без onFailure: block пропуска (fail-open) — по-къс timeout е отслабване.
    if (!kept.some((c) => c.timeout >= h.timeout)) return `намален timeout на ${h.key.slice(0, 120)}`;
  }
  return null;
}

export function decide(payload, { readFile = (p) => readFileSync(p, "utf8"), headOf = gitHead } = {}) {
  const source = payload?.source || "";
  if (source === "skills") return "умение, сменено по време на сесия, влиза от следващата сесия";
  if (!/_settings$/.test(source) || source === "policy_settings") return null;
  let next;
  try { next = JSON.parse(readFile(payload.file_path)); } catch { return "неразбираем JSON — остават досегашните настройки"; }
  let base = null;
  if (source === "project_settings") { try { base = JSON.parse(headOf(payload.file_path)); } catch { base = null; } }
  return weakening(source, next, base);
}

function gitHead(file) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(file), encoding: "utf8" }).trim();
  return execFileSync("git", ["show", `HEAD:${relative(root, file)}`], { cwd: root, encoding: "utf8" });
}

function log(entry) {
  try {
    const dir = join(HERE, "_state");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "config-changes.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch { /* дневникът не решава */ }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(2); }
  let why;
  try { why = decide(payload); } catch { why = "вътрешна грешка на пазача — fail-closed"; }
  log({ source: payload.source, file: payload.file_path, blocked: !!why, why: why || null });
  if (why && payload.source !== "policy_settings") {
    process.stderr.write(`guard-config: промяната не се прилага в тази сесия (${why}). Влиза от нова сесия, след ревю.\n`);
    process.exit(2);
  }
  process.exit(0);
}
