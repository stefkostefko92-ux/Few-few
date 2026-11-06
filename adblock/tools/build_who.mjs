#!/usr/bin/env node
// build_who.mjs — картата „правило → компания“ за отчета „Кой те следи“ (6.0).
//
// В публикуваното разширение Chrome казва само КОЕ правило е блокирало заявка (ruleset + id),
// никога адреса (getMatchedRules). За да броим „Google ×12, Criteo ×4“, при билда минаваме през
// статичните рулсетове от manifest-а и за всяко блокиращо правило, насочено към домейн с известен
// собственик (popup/companies.js — точен домейн или поддомейн, никога догадка), записваме компанията.
// Правило за много домейни на РАЗЛИЧНИ компании или без домейн (път, регекс) не получава нищо.
//
//   node tools/build_who.mjs           # пише rules/who.json
//   node tools/build_who.mjs --check   # проверява, че rules/who.json е свеж (tests/who.test.mjs)
//
// Формат: { "v": 1, "companies": [имена], "rules": { rulesetId: { ruleId: индекс } } }.
// Пускай след build_filters.mjs / generate_rules.py и след промяна на popup/companies.js.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "rules", "who.json");

export function loadCompanies() {
  const ctx = {};
  ctx.globalThis = ctx;
  runInNewContext(readFileSync(join(ROOT, "popup", "companies.js"), "utf8"), ctx);
  return ctx.SA_COMPANIES.companyOf;
}

// "||host^…" / "||host/…" / "|https://host/…" → host; anything else (a path, a pattern) → ""
export function filterHost(urlFilter) {
  const m = /^(?:\|\||\|https?:\/\/)([a-z0-9.-]+\.[a-z0-9-]+)(?=[\^\/:?|]|$)/i.exec(String(urlFilter || ""));
  return m ? m[1].toLowerCase() : "";
}

export function companyOfRule(rule, companyOf) {
  const type = rule && rule.action && rule.action.type;
  if (type !== "block" && type !== "redirect") return ""; // allow / headers / upgrade are not "stopped"
  const c = rule.condition || {};
  const hosts = [];
  if (Array.isArray(c.requestDomains) && c.requestDomains.length) hosts.push(...c.requestDomains);
  else if (c.urlFilter) { const h = filterHost(c.urlFilter); if (h) hosts.push(h); }
  if (!hosts.length) return "";
  const owners = new Set(hosts.map((h) => companyOf(h)));
  if (owners.size !== 1) return ""; // several companies, or a host nobody is known to own
  return [...owners][0];
}

export function buildWho() {
  const companyOf = loadCompanies();
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const names = [];
  const index = new Map();
  const rules = {};
  for (const res of manifest.declarative_net_request?.rule_resources || []) {
    const file = join(ROOT, res.path);
    if (!existsSync(file)) continue;
    const list = JSON.parse(readFileSync(file, "utf8"));
    const map = {};
    for (const r of list) {
      const co = companyOfRule(r, companyOf);
      if (!co) continue;
      if (!index.has(co)) { index.set(co, names.length); names.push(co); }
      map[r.id] = index.get(co);
    }
    if (Object.keys(map).length) rules[res.id] = map;
  }
  return JSON.stringify({ v: 1, companies: names, rules }) + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = buildWho();
  if (process.argv.includes("--check")) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== json) { console.error("rules/who.json is stale — run: node tools/build_who.mjs"); process.exit(1); }
    console.log("who: rules/who.json is up to date");
  } else {
    writeFileSync(OUT, json);
    const d = JSON.parse(json);
    const n = Object.values(d.rules).reduce((a, m) => a + Object.keys(m).length, 0);
    console.log(`who: ${n} rules → ${d.companies.length} companies (${(json.length / 1024).toFixed(1)} KB) → rules/who.json`);
  }
}
