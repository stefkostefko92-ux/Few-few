#!/usr/bin/env node
// pr-triage.mjs — за всеки отворен PR: кой продукт, какъв вид промяна и кои НАШИ агенти трябва да го видят.
//
// Защо (правило на собственика, 2026-10-27): „на всеки отворен проект да се пускат наши агенти, когато има
// нужда“. „Когато има нужда“ трябва да е правило, не настроение: код или зависимости → Кодаджията винаги +
// собственикът на домейна (каса → Касаджията, плащания → Продавача, деплой → VPS-аджията …); само
// документи/проучване → никой (няма какво да счупи). Пътищата идват от git, не от заглавието.
//
//   node tools/agents/pr-triage.mjs --prs <файл.json>   # [{number,title,head:{ref}}] (от GitHub)
//   … --json                                            # машинен изход (план за live-run)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Собственикът на домейна по продукт (коренният CLAUDE.md, „Products“). Кодаджията се добавя за всеки код.
export const DOMAIN = {
  CSPos: ["kasadjiyata"], panev: ["prodavacha"], linketto: ["prodavacha"], korpora: ["prodavacha"],
  treydar: ["treydara"], adblock: ["hromadjiyata"], SupremeBot: ["hromadjiyata"],
  SupremeDiscordBot: ["diskordjiyata"], deploy: ["vps-adjiyata"], vpsdash: ["vps-adjiyata"],
  zabobovdol: ["seo"], medqr: ["pravniyat-razbirach"], piuma: ["socialdjiyata"], agentgw: ["ai-djiyata"],
  Gaming: ["prodavacha"], Nexus: ["dizayner"], mastilko: ["seo"], vizitka: ["seo"], eternaltouch: ["seo"],
  ".github": ["konveyera"], ".claude": ["ai-djiyata"], tools: ["ai-djiyata"], "agents-dashboard": ["ai-djiyata"],
  FiveM: ["geymara"], deja: ["hromadjiyata"], chatchat: ["ai-djiyata"], liftpilot: ["asansyorchika"],
  minecraft: ["vps-adjiyata"], cs2dm: ["vps-adjiyata"],
  "tools/betting": ["goladjiyata"], "tools/seo": ["seo"], "tools/commerce": ["prodavacha"], "tools/security": [],
};
/** Собственикът на домейна; непознат `tools/<x>` е агентският/вътрешният инструментариум → AI-джията. */
const owners = (p) => DOMAIN[p] || (p.startsWith("tools/") ? DOMAIN.tools : []);
// Данни, не код: документи, картинки, паметта на агентите и генерираните данни на таблото (поуките
// пристигат с всеки клон от времето преди отделния клон agents/memory — не са промяна за преглед).
const DOC = /(^|\/)(docs?|research)\/|\.(md|txt|pdf|png|jpe?g|svg|webp)$|^\.claude\/agents\/_memory\/|^agents-dashboard\/(agents\.json|docs\.js|usage\.json)$/i;
const DEPS = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/;

/** Вид на промяната по пътищата: docs · deps · code. */
export function kindOf(files) {
  if (!files.length) return "empty";
  if (files.every((f) => DOC.test(f))) return "docs";
  if (files.every((f) => DEPS.test(f) || DOC.test(f))) return "deps";
  return "code";
}

/** Продуктите (папки от първо ниво), без файловете в корена; `tools/` е по подпапка (tools/betting ≠ tools/agents). */
export function productsOf(files) {
  const top = (f) => { const p = f.split("/"); return p.length < 2 ? null : p[0] === "tools" && p.length > 2 ? `tools/${p[1]}` : p[0]; };
  return [...new Set(files.map(top).filter(Boolean))].sort();
}

// Най-много толкова собственици на домейн на PR (освен Кодаджията): PR, който пипа шест продукта
// заради една SEO поправка, не иска шест прегледа — взимат се продуктите с най-много променени файлове.
export const MAX_DOMAIN = 2;

/** Нужните наши агенти: код → Кодаджията + собствениците на домейна (по реда на products — най-засегнатият
 *  първи); само зависимости → Кодаджията (уязвима или чупеща версия е негово; домейнът не се пипа);
 *  документи → никой. */
export function agentsFor(kind, products, max = MAX_DOMAIN) {
  if (kind === "docs" || kind === "empty") return [];
  if (kind === "deps") return ["kodadjiyata"];
  const domain = [...new Set(products.flatMap(owners))].filter((a) => a !== "kodadjiyata").slice(0, max);
  return ["kodadjiyata", ...domain];
}

/** Продуктите по брой променени файлове с код (низходящо) — за избора на собственици на домейна. */
export function rankProducts(files) {
  const n = new Map();
  for (const f of files) { if (DOC.test(f)) continue; const [p] = productsOf([f]); if (p) n.set(p, (n.get(p) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p);
}

// Застарял PR (последен комит преди повече дни) не се преглежда: кодът под него се е сменил и прегледът
// би описал минало. Първо решение на собственика — rebase или затваряне; тогава влиза отново в плана.
export const STALE_DAYS = 30;

/** Решението за един PR: кои агенти и защо (или защо никой). Чиста функция. */
export function decide({ kind, products, ageDays, reviewed = [] }) {
  if (kind === "docs" || kind === "empty") return { agents: [], why: "само документи — няма какво да счупи" };
  if (ageDays > STALE_DAYS) return { agents: [], why: `застарял (${ageDays} дни) — първо rebase или затваряне` };
  const all = agentsFor(kind, products);
  const agents = all.filter((a) => !reviewed.includes(a));
  if (!agents.length) return { agents: [], why: "вече прегледан на тази версия" };
  return { agents, why: kind === "deps" ? "зависимости" : "код" };
}

function git(args) { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 }); }

export function changedFiles(ref, base = "origin/main") {
  try { execFileSync("git", ["-C", ROOT, "fetch", "-q", "origin", `+refs/heads/${ref}:refs/remotes/origin/${ref}`], { stdio: "ignore" }); } catch { /* може да е вече локален */ }
  const files = git(["diff", "--name-only", `${base}...origin/${ref}`]).split("\n").filter(Boolean);
  const last = Date.parse(git(["log", "-1", "--format=%cI", `origin/${ref}`]).trim());
  const sha = git(["rev-parse", `origin/${ref}`]).trim();
  return { files, ageDays: Math.floor((Date.now() - last) / 86400000), sha };
}

// Дневник на прегледите: {"<sha>": ["kodadjiyata", …]} — същата версия не се преглежда два пъти.
export const LEDGER = join(ROOT, "tools", "agents", "pr-reviews.json");
export function loadLedger(file = LEDGER) {
  try { return JSON.parse(readFileSync(file, "utf8")).reviewed || {}; } catch { return {}; }
}

export function triage(prs, info = changedFiles, ledger = {}) {
  return prs.map((p) => {
    let r;
    try { r = info(p.head.ref); } catch (e) { return { pr: p.number, title: p.title, ref: p.head.ref, error: String(e.message).slice(0, 120), agents: [], why: "грешка при git" }; }
    const kind = kindOf(r.files), products = productsOf(r.files);
    const d = decide({ kind, products: rankProducts(r.files), ageDays: r.ageDays, reviewed: ledger[r.sha] || [] });
    return { pr: p.number, title: p.title, ref: p.head.ref, sha: r.sha, kind, products, files: r.files.length, ageDays: r.ageDays, ...d };
  });
}

/** TSV (номер<TAB>клон<TAB>заглавие) или JSON [{number,title,head:{ref}}]. */
export function parsePrs(text) {
  const t = text.trim();
  if (t.startsWith("[")) return JSON.parse(t);
  return t.split("\n").filter(Boolean).map((l) => { const [n, ref, title = ""] = l.split("\t"); return { number: Number(n), title, head: { ref } }; });
}

function main(argv) {
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (!val("--prs")) { console.error("употреба: pr-triage.mjs --prs <файл.json|.tsv> [--json] [--skip <номер,…>]"); process.exit(2); }
  try { execFileSync("git", ["-C", ROOT, "fetch", "-q", "origin", "main"], { stdio: "ignore" }); } catch { /* офлайн — сравнява с наличния origin/main */ }
  const skip = (val("--skip") || "").split(",").map(Number).filter(Boolean);
  const prs = parsePrs(readFileSync(val("--prs"), "utf8")).filter((p) => !skip.includes(p.number));
  const plan = triage(prs, changedFiles, loadLedger());
  if (argv.includes("--json")) { console.log(JSON.stringify(plan, null, 2)); return; }
  for (const p of plan) console.log(`#${p.pr} ${p.kind || "?"} [${(p.products || []).join(",")}] ${p.ageDays ?? "?"}д → ${p.agents.length ? p.agents.join(" + ") : "без агент"} · ${p.why}${p.error ? " · " + p.error : ""}`);
  const need = plan.filter((p) => p.agents.length);
  console.log(`\n${need.length} от ${plan.length} PR-а искат наши агенти · ${need.reduce((a, p) => a + p.agents.length, 0)} прегледа`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
