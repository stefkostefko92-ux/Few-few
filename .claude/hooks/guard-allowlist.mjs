#!/usr/bin/env node
// guard-allowlist.mjs — PreToolUse(Bash|PowerShell|Monitor): агент с Bash по ПОЗВОЛЕН СПИСЪК пуска само изброеното.
//
// Защо (23.11.2026, решение на собственика „най-добрите и безопасни варианти“): Преводача трябва да пуска
// детерминистичните i18n проверки (`check-parity`, `glossary-check`, `pseudo`) — дефиницията му ги иска като
// условие за „готово“, а без Bash заобикаляше с Grep (5 поуки в паметта му). Той обаче чете и външни страници
// (WebFetch/WebSearch за терминология): пълен Bash плюс недоверено съдържание е смъртоносната тройка. Затова Bash
// получава само тази кука като врата: нищо извън списъка, никакви верижни команди, субституции, кавички, глобове,
// пътища навън или пренасочване в репото. Списъкът е ТУК (под guard-self — агент не може да си го разшири), не в
// дефиницията.
//
// Граматиката е нарочно малка — позволено е само: `node <скрипт от списъка> <арг>… [> <временен файл>]`, където
// аргументите са относителни пътища/кодове от безопасни знаци. Всичко друго → отказ с причината и с това, което Е
// позволено. Агент, който не е в списъка, не се съди тук (другите пазачи остават в сила за всички).
// Грешка на куката за агент от списъка → спира (fail-closed); onFailure: block в settings.json.

import { readFileSync } from "node:fs";
import { isMain } from "../../tools/lib/is-main.mjs";

export const ALLOW = Object.freeze({
  prevodach: Object.freeze({
    scripts: Object.freeze(["tools/i18n/check-parity.mjs", "tools/i18n/glossary-check.mjs", "tools/i18n/pseudo.mjs"]),
  }),
});

const SAFE_CHARS = /^[A-Za-z0-9_.\/@,+\- >]*$/;
const SAFE_ARG = /^[A-Za-z0-9_][A-Za-z0-9_.\/@,+-]*$/;

/** Описание на позволеното — влиза в съобщението за отказ. */
export function allowedText(agent) {
  const a = ALLOW[agent];
  return a ? a.scripts.map((s) => `node ${s} <файлове>`).join(" · ") + " (по желание `> /tmp/…` или `> <scratchpad>/…`)" : "";
}

const tempTarget = (t, scratch) => !t.includes("..") && (t.startsWith("/tmp/") || Boolean(scratch && t.startsWith(scratch.replace(/\/?$/, "/"))));

/** Чиста логика: "" = позволено, иначе причина за отказ. Агент извън списъка → "" (не се съди тук). */
export function allowReason(agent, command, { scratch = "" } = {}) {
  const cfg = ALLOW[agent];
  if (!cfg) return "";
  const raw = String(command ?? "").trim();
  if (!raw) return "празна команда";
  if (!SAFE_CHARS.test(raw)) return "непозволен знак (верижни команди, субституции, кавички, глобове, променливи и нови редове са забранени)";
  let toks = raw.split(/ +/);
  const gt = toks.indexOf(">");
  if (toks.some((t, i) => t.includes(">") && i !== gt)) return "пренасочване само като „> <файл>“ в края";
  if (gt >= 0) {
    if (gt !== toks.length - 2) return "пренасочването трябва да е последно: „> <файл>“";
    if (!tempTarget(toks[gt + 1], scratch)) return `пренасочване извън /tmp и scratchpad-а (${toks[gt + 1]})`;
    toks = toks.slice(0, gt);
  }
  if (toks[0] !== "node") return `командата не е в списъка (${toks[0]})`;
  if (!cfg.scripts.includes(toks[1] || "")) return `скриптът не е в списъка (${toks[1] || "—"})`;
  const args = toks.slice(2);
  if (!args.length) return "липсват файлове";
  for (const a of args) if (!SAFE_ARG.test(a) || a.includes("..")) return `аргументът не е относителен път или код (${a})`;
  return "";
}

function deny(agent, why) {
  process.stderr.write(
    `guard-allowlist: „${agent}“ има Bash само за: ${allowedText(agent)}. Отказано: ${why}. ` +
    `Друга команда → поискай я в ПРЕДАВАНЕ (оркестраторът я пуска и ти връща изхода).\n`,
  );
  process.exit(2);
}

function main() {
  let p;
  try { p = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  const agent = String(p?.agent_type || "");
  if (!ALLOW[agent]) process.exit(0);
  try {
    if (p.tool_name === "PowerShell") deny(agent, "PowerShell не е в списъка");
    const why = allowReason(agent, p.tool_input?.command, { scratch: String(p.scratchpad_dir || "") });
    if (why) deny(agent, why);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`guard-allowlist: куката не може да провери командата (${String(e?.message || e).slice(0, 120)}) — спира.\n`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) main();
