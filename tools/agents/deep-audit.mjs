#!/usr/bin/env node
// deep-audit.mjs — дълбок одит на целия слой: дупки, тихи сривове, несъответствия.
//
// Защо отделно от `oversee.mjs`: надзорът пази ЦЯЛОСТТА на агентския екип (дефиниция ↔ памет ↔
// регистър ↔ куки). Този тук гони другия клас проблеми — **несъответствие между документ и
// реалност** и **проверка, която мълчи, защото гледа грешния източник**. Всяка от проверките е
// добавена, защото реален пропуск е минал покрай нас:
//
//   • injection покритието се четеше от `agents.json`, а два агента имаха WebFetch само в
//     дефиницията → гейтът рапортуваше „всички покрити" за агенти без нито един тест;
//   • `stripe-payment` цитираше `tools/payments/stripe-lint.mjs` (реалният път е `tools/commerce/`)
//     и линтът мълчеше, защото проверяваше само `scripts/` препратки;
//   • `SupremeBot/` е продукт с `package.json`, но липсваше в таблицата на CLAUDE.md, нямаше
//     собствен CLAUDE.md и няма CI — нито един агент не знаеше, че съществува.
//
// Твърдо (exit 1): счупени препратки, недокументиран продукт, разсинхрон на регистъра.
// Съветващо (доклад): продукт без CI, инструмент без тест, висока карантина.
//
//   node tools/agents/deep-audit.mjs            # четим отчет
//   node tools/agents/deep-audit.mjs --json
//   node tools/agents/deep-audit.mjs --check    # exit 1 при твърд пропуск

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const CHECK = argv.includes("--check");

const R = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (p) => existsSync(join(ROOT, p));

// Служебни директории — не са продукти, макар да имат код.
const NON_PRODUCT = new Set(["tools", "deploy", "docs", "research", "client", "agents-dashboard", "node_modules"]);

export function agentIds(dir = join(ROOT, ".claude", "agents")) {
  return readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
    .map((f) => f.replace(/\.md$/, "")).sort();
}

/** Продукт = папка в корена с package.json ИЛИ със собствен CLAUDE.md (статичните нямат package.json). */
export function productDirs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !NON_PRODUCT.has(d.name))
    .map((d) => d.name)
    .filter((n) => existsSync(join(ROOT, n, "package.json")) || existsSync(join(ROOT, n, "CLAUDE.md")))
    .sort();
}

/**
 * Всички `tools/….mjs` препратки в даден текст, които НЕ съществуват спрямо КОРЕНА на репото.
 *
 * `\b` пред „tools" не стига: в `adblock/tools/build_filters.mjs` има граница веднага след „/",
 * затова наивният шаблон реже продуктовия префикс и обявява реален файл за счупен. Продуктите
 * имат свои `tools/` папки — препратките в тях са спрямо продукта, не спрямо корена. Затова
 * искаме „tools/" да НЕ е предшествано от път или дума.
 */
export function brokenToolRefs(text) {
  const re = /(?<![\w/-])tools\/[\w./-]+\.mjs\b/g;
  return [...new Set(String(text || "").match(re) || [])].filter((p) => !has(p));
}

// Одит 2026-08-03: verified поука, цитираща файлов път, който вече не съществува, гние тихо (ledger
// го отбеляза като НЕгейтван). Пълната проверка „всеки цитиран път съществува" НЕ е гейтваема —
// доминирана от 4 неразделими FP класа: (1) upstream/library docs (`docs/api.md`=WiseLibs,
// `docs/jwt/…`=jose), (2) нарочно-липсващ файл (самата находка Е отсъствието), (3) неточност но
// съществува (`mastilko/globals.css` → реалният `mastilko/src/app/globals.css`), (4) продуктов
// чурн. Затова гейтваме САМО ТЕСНИЯ ЧИСТ подмножество: пътища към АГЕНТ-СЛОЯ, който ПРИТЕЖАВАМЕ
// (нискочурн, никога upstream/нарочно-липсващ). Точно този клас беше treydara дефектът
// (`tools/agents/memory-preload.mjs` вместо `.claude/hooks/…`). Разширенията са ДЪЛГИ-ПЪРВО +
// граница, иначе `js` реже `versions.json`→`versions.js` (документиран FP, за малко да го повторя).
const OWNED_INFRA = [/^\.claude\/hooks\//, /^\.claude\/agents\//, /^\.claude\/settings\.json$/,
  /^tools\/agents\//, /^tools\/hooks\//, /^tools\/lib\//, /^tools\/security\//, /^tools\/skills\//,
  /^tools\/seo\//, /^tools\/qa\//, /^agents-dashboard\/[\w./-]+\.(?:mjs|js|json|html)$/,
  // Кръг 4 (2026-08-04): `deploy/` в КОРЕНА е наша, нискочурн папка — там няма upstream докове,
  // затова е безопасна за гейтване. Реален случай: паметта на VPS-аджията сочеше
  // `deploy/systemd/ospedali.service`, а файлът живее в `ospedalitrasparenti/deploy/systemd/`
  // (продуктът беше преименуван). Съдържанието на поуката беше вярно — сгрешен беше пътят, и то
  // в поука за ИНЦИДЕНТ (crash-loop status=31/SYS), когато точният път струва най-много.
  /^deploy\//];
const MEM_PATH_RE = /([A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)+\.(?:jsonl|json|mjs|cjs|jsx|tsx|js|ts|md|sh|yml|yaml|css|html|txt|service|conf)(?![A-Za-z0-9]|\.\w))(?::[\d,\-]+)?/g;
export function brokenOwnedMemPaths(bulletText) {
  const noUrls = String(bulletText || "").replace(/https?:\/\/\S+/g, " ");
  const out = [];
  for (const m of noUrls.matchAll(MEM_PATH_RE)) {
    const p = m[1];
    if (p.includes("/node_modules/")) continue;
    if (!OWNED_INFRA.some((re) => re.test(p))) continue; // само притежаваната инфра (FP-чисто)
    if (!has(p)) out.push(p);
  }
  return [...new Set(out)];
}

/**
 * Редове, на които дефиницията нарежда да ИЗПЪЛНИ команда (`node/bash/npx tools/…`) като
 * ЗАДЪЛЖЕНИЕ (пусни/DoD/верификатор/гейт), докато `tools` няма Bash → неизпълним договор.
 * Чиста функция (md + toolset низ) за да е тествана. Президентски одит 2026-07-29 (Правният).
 * Просто СПОМЕНАВАНЕ на инструмент в проза не е дефект — искаме рамка на задължение.
 */
export function execWithoutBash(md, toolset) {
  if (/\bBash\b/.test(String(toolset || ""))) return [];
  const out = [];
  String(md || "").split("\n").forEach((l, i) => {
    const hasCmd = /`(?:node|bash|npx|sh)\s+tools\/[\w./-]+/.test(l);
    const isDuty = /(?:пусни|пускаш|изпълни|стартирай|преди\s+[„"]?готово|DoD|верификатор|минава\s+(?:детерминистичн|гейт)|гейт)/i.test(l);
    if (hasCmd && isDuty) out.push(i + 1);
  });
  return out;
}

export function audit() {
  const hard = [], soft = [];
  const ids = agentIds();

  // 1. Регистър ↔ дефиниция: инструменти/модел/усилие (кара injection гейта да лъже, ако дрейфне).
  let aj = null;
  try { aj = JSON.parse(R("agents-dashboard/agents.json")); } catch { hard.push({ kind: "registry", msg: "agents-dashboard/agents.json не се парсва" }); }
  if (aj) {
    for (const a of aj.agents) {
      if (!has(`.claude/agents/${a.id}.md`)) { hard.push({ kind: "registry", msg: `agents.json описва несъществуващ агент „${a.id}"` }); continue; }
      const md = R(`.claude/agents/${a.id}.md`);
      const fm = (k) => (md.match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [])[1]?.trim();
      const dT = (fm("tools") || "").split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
      const jT = (Array.isArray(a.tools) ? a.tools : []).map((s) => String(s).trim()).filter(Boolean).sort().join(",");
      if (dT && jT && dT !== jT) hard.push({ kind: "registry", msg: `${a.id}: tools разсинхрон def=[${dT}] json=[${jT}]` });
      for (const k of ["model", "effort"]) {
        const d = fm(k), j = a[k];
        if (d && j && d !== j) hard.push({ kind: "registry", msg: `${a.id}: ${k} разсинхрон def=${d} json=${j}` });
      }
    }
    const jsonIds = new Set(aj.agents.map((a) => a.id));
    for (const id of ids) if (!jsonIds.has(id)) hard.push({ kind: "registry", msg: `агент „${id}" липсва в agents.json` });
  }

  // 2. Инжекционно покритие — спрямо ДЕФИНИЦИЯТА (източникът на истината).
  const specDir = "tools/agents/evals/specs";
  const specs = has(specDir) ? readdirSync(join(ROOT, specDir)).filter((f) => f.endsWith(".json"))
    .map((f) => { try { return JSON.parse(R(`${specDir}/${f}`)); } catch { return null; } }).filter(Boolean) : [];
  const injAgents = new Set(specs.filter((s) => s.kind === "injection" || String(s.id).startsWith("injection-")).map((s) => s.agent));
  for (const id of ids) {
    const t = (R(`.claude/agents/${id}.md`).match(/^tools:\s*(.+)$/m) || [])[1] || "";
    if (/WebFetch|WebSearch/.test(t) && !injAgents.has(id))
      hard.push({ kind: "injection", msg: `${id} чете недоверено външно съдържание (WebFetch/WebSearch), но няма инжекционен spec` });
  }

  // 2b. Инструкция↔инструментариум: дефиниция, която нарежда да ИЗПЪЛНЯВА команди (`node tools/…`,
  //     `bash …`), но агентът НЯМА Bash → неизпълним договор. Президентският колегиален одит
  //     (2026-07-29) намери точно това у Правния Разбирач: DoD иска да пусне 5 скрипта, а `tools`
  //     е Read/Grep/Glob/WebFetch/WebSearch. Гейтовете сверяваха дефиниция↔регистър↔matcher, но
  //     НИКОЙ не сверяваше „изисквани команди ⊆ наличен инструментариум". Детерминистично е.
  for (const id of ids) {
    const md = R(`.claude/agents/${id}.md`);
    const toolset = (md.match(/^tools:\s*(.+)$/m) || [])[1] || "";
    const execLines = execWithoutBash(md, toolset);
    if (execLines.length)
      hard.push({ kind: "exec-without-bash", msg: `${id}: дефиницията нарежда да ИЗПЪЛНИ команда като DoD (ред ${execLines.slice(0, 5).join(",")}), но „tools" няма Bash → неизпълним договор (изходът от скенера идва от агент с Bash, или добави Bash)` });
  }

  // 3. Счупени препратки към инструменти — в дефиниции, skills и общата доктрина.
  const refSources = [
    ...ids.map((id) => [`.claude/agents/${id}.md`, `агент ${id}`]),
    ...(has(".claude/skills") ? readdirSync(join(ROOT, ".claude", "skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, ".claude", "skills", d.name, "SKILL.md")))
      .map((d) => [`.claude/skills/${d.name}/SKILL.md`, `skill ${d.name}`]) : []),
    ["CLAUDE.md", "root CLAUDE.md"],
  ];
  for (const [file, who] of refSources)
    for (const p of brokenToolRefs(R(file)))
      hard.push({ kind: "broken-ref", msg: `${who} реферира несъществуващ ${p}` });

  // 4. Продукт без документация. CLAUDE.md твърди „всеки продукт има свой CLAUDE.md" — гейтваме го.
  const products = productDirs();
  const rootMd = R("CLAUDE.md");
  for (const p of products) {
    if (!has(`${p}/CLAUDE.md`)) hard.push({ kind: "product-doc", msg: `продукт „${p}" няма собствен CLAUDE.md (законът в root CLAUDE.md)` });
    if (!new RegExp("`" + p + "/`").test(rootMd)) hard.push({ kind: "product-doc", msg: `продукт „${p}" липсва в таблицата на root CLAUDE.md — агентите не знаят, че съществува` });
  }

  // 5. Продукт без CI (съветващо: workflow-ите са path-филтрирани, липсата е реален риск, но
  //    създаването им е решение на собственика, не автоматична поправка).
  const wfDir = ".github/workflows";
  const wfText = has(wfDir) ? readdirSync(join(ROOT, wfDir)).map((f) => R(`${wfDir}/${f}`)).join("\n") : "";
  for (const p of products) if (!new RegExp(p + "/\\*\\*").test(wfText)) soft.push({ kind: "no-ci", msg: `продукт „${p}" няма path-филтриран workflow` });

  // 6. Инструменти без никакво тестово покритие (съветващо).
  const toolFiles = [], testSrc = [];
  (function walk(d) {
    for (const x of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      if (x.isDirectory()) { if (!["node_modules", "fixtures"].includes(x.name)) walk(join(d, x.name)); }
      else if (x.name.endsWith(".test.mjs")) testSrc.push(R(join(d, x.name)));
      else if (x.name.endsWith(".mjs")) toolFiles.push(join(d, x.name));
    }
  })("tools");
  const allTests = testSrc.join("\n");
  const untested = toolFiles.filter((t) => !allTests.includes(t.split("/").pop()));
  if (untested.length) soft.push({ kind: "untested", msg: `${untested.length}/${toolFiles.length} инструмента без тестово покритие`, list: untested.map((t) => relative("tools", t)) });

  // 7. Карантина: висок дял значи агентът произвежда недоказани твърдения (съветващо, не дефект).
  const MEM = ".claude/agents/_memory";
  const bullets = (md, h) => {
    const L = md.split("\n"); const s = L.findIndex((l) => new RegExp("^##\\s*" + h).test(l));
    if (s < 0) return null;
    const o = []; for (let i = s + 1; i < L.length; i++) { if (/^##\s/.test(L[i])) break; if (L[i].trim().startsWith("- ")) o.push(L[i]); }
    return o;
  };
  // confidence-таг (verified|unverified) от последния _(...)_ трейлър. ВНИМАНИЕ: текст/източник
  // съдържат скоби И „;" — затова НЕ split[1] (счупи се на `[^)]*` при първата скоба); confidence
  // е enum token, ограден с „;" (научено: позиционен парсер лъже при скоби в съдържанието).
  const confidenceOf = (line) => {
    const m = line.match(/_\((.*)\)_\s*$/); // greedy до последния )_ в края
    if (!m) return null;
    if (/;\s*unverified\s*(;|$)/i.test(m[1])) return "unverified";
    if (/;\s*verified\s*(;|$)/i.test(m[1])) return "verified";
    return null;
  };
  for (const id of ids) {
    if (!has(`${MEM}/${id}.md`)) { hard.push({ kind: "memory", msg: `агент „${id}" няма файл с памет` }); continue; }
    const md = R(`${MEM}/${id}.md`);
    // 7a. ТВЪРДО: дублирано заглавие на секция. ensureSections пише канонична форма, но исторически
    // дрейф на текста („непроверено — не се чете" vs „непроверени — НЕ са факт") остави ДВЕ „## Карантина"
    // в 5 файла → readerите четат само първата, вторият блок булети е невидим. Точно 1 от всяка.
    const provHeads = (md.match(/^##\s*Проверени поуки/gm) || []).length;
    const quarHeads = (md.match(/^##\s*Карантина/gm) || []).length;
    if (provHeads > 1) hard.push({ kind: "memory-dup", msg: `${id}: ${provHeads}× заглавие „## Проверени поуки" (readerите четат само първото)` });
    if (quarHeads > 1) hard.push({ kind: "memory-dup", msg: `${id}: ${quarHeads}× заглавие „## Карантина" (readerите четат само първото)` });
    // 7b. ТВЪРДО: поука с таг `verified` под „## Карантина" = противоречие (секцията е „НЕ са факт")
    // и се ИЗКЛЮЧВА от инжекцията → мъртво знание. Историческо остатъчно състояние от когато старият
    // sourceIsReal беше по-строг и сваляше verified поуки в Карантина. Routing-ът днес е коректен;
    // това пази срещу рецидив (ръчна редакция/стар импорт).
    const q = bullets(md, "Карантина");
    const buriedVerified = (q || []).filter((l) => confidenceOf(l) === "verified");
    for (const l of buriedVerified) hard.push({ kind: "buried-lesson", msg: `${id}: поука с таг „verified" под „## Карантина" (мъртво знание): ${l.slice(6, 66).trim()}…` });
    // 7b′. ТВЪРДО: verified поука цитира АГЕНТ-СЛОЙ път (моята инфра), който не съществува — мъртва
    // препратка, която репо гейтовете не хващаха (treydara класът). Само притежаваната инфра (FP-чисто).
    const v = bullets(md, "Проверени поуки") || [];
    for (const l of v) for (const p of brokenOwnedMemPaths(l))
      hard.push({ kind: "dead-mem-path", msg: `${id}: verified поука цитира несъществуващ агент-слой път „${p}"` });
    // 7c. съветващо: висок дял карантина
    if (q === null) soft.push({ kind: "memory", msg: `${id}: няма секция „Карантина"` });
    else if (v.length >= 20 && q.length / v.length > 0.30)
      soft.push({ kind: "quarantine", msg: `${id}: карантина ${q.length}/${v.length} (${Math.round(q.length / v.length * 100)}%) — произвежда много недоказани твърдения` });
  }

  // 7d. ТВЪРДО: същата проверка за ФЛОТ-ШИРОКИТЕ инжектирани файлове (memory-preload ги слага в
  // статичния префикс на ВСЕКИ агент — мъртъв път там струва ×флота, по-скъпо от в една памет).
  // Гейтът за агентите (7b′) ги пропускаше, защото не са в списъка `ids`.
  for (const f of ["_shared.md", "SECURITY.md", "PROCEDURE.md"]) {
    if (!has(`${MEM}/${f}`)) continue;
    for (const l of R(`${MEM}/${f}`).split("\n")) {
      if (!/^[-*]\s|`/.test(l)) continue; // булет или ред със `код`
      for (const p of brokenOwnedMemPaths(l))
        hard.push({ kind: "dead-mem-path", msg: `_memory/${f} (инжектиран ×флота) цитира несъществуващ агент-слой път „${p}"` });
    }
  }

  return { hard, soft, counts: { agents: ids.length, products: products.length, specs: specs.length, tools: toolFiles.length } };
}

async function main() {
  const { hard, soft, counts } = audit();
  if (JSON_OUT) { await emitJsonNow({ hard, soft, counts }, CHECK && hard.length ? 1 : 0); }

  const g = (s) => `\x1b[32m${s}\x1b[0m`, r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, d = (s) => `\x1b[90m${s}\x1b[0m`;
  console.log(`\n🔬  Дълбок одит — ${counts.agents} агента · ${counts.products} продукта · ${counts.specs} spec-а · ${counts.tools} инструмента\n`);

  if (!hard.length) console.log(g("  ✓ нула твърди пропуски (регистър · инжекции · препратки · продуктова документация)"));
  for (const h of hard) console.log(`  ${r("✗")} [${h.kind}] ${h.msg}`);

  if (soft.length) {
    console.log(`\n  ${y("▲ съветващи")} (не гейтват — решението е на собственика):`);
    for (const s of soft) {
      console.log(`    · [${s.kind}] ${s.msg}`);
      if (s.list) console.log(d(`        ${s.list.slice(0, 8).join(" · ")}${s.list.length > 8 ? ` … +${s.list.length - 8}` : ""}`));
    }
  }
  console.log(hard.length ? r(`\nСТАТУС: ${hard.length} твърди пропуска.\n`) : g("\nСТАТУС: чисто.\n"));
  process.exit(CHECK && hard.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
