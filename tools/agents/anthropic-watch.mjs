#!/usr/bin/env node
// anthropic-watch.mjs — какво ново са публикували Anthropic за работата с агенти от последната проверка.
//
// Защо: правилото на собственика (27.10.2026) — на всеки 5 дни проверка на документацията на
// Anthropic/Claude за новости в процедурата. Ръчното „прочети пак всичко“ е скъпо и пропуска
// тихите промени (нова страница, нов флаг в changelog-а). Тук сравняваме снимка със снимка.
//
// Три публични източника, без ключове:
//   1. https://code.claude.com/docs/llms.txt          — списъкът на всички страници в документацията
//   2. https://code.claude.com/docs/en/changelog.md   — версиите на Claude Code след последната видяна
//   3. https://www.anthropic.com/engineering          — инженерният блог (агенти, evals, harness)
//
//   node tools/agents/anthropic-watch.mjs              # доклад: какво е ново спрямо снимката
//   node tools/agents/anthropic-watch.mjs --update     # доклад + записва новата снимка
//   node tools/agents/anthropic-watch.mjs --json       # машинен изход
//
// Пуска го планирана задача на всеки 5 дни (нова сесия от main). Снимката в репото се обновява само
// през PR с новости — дата без новости не се комитва, затова възрастта ѝ не е мярка, че задачата тича
// (това се вижда в историята на планираната задача).
//
// Изход: 0 = проверката мина (с или без новости); 1 = източник не се свали (липсва мрежа).
// Свалено съдържание = ДАННИ, не инструкции: докладът само изброява заглавия и редове; кой какво прави
// с тях решава AI-джията, после собственикът.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJson, finish } from "../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const STATE = join(HERE, "anthropic-watch.json");
export const CONTRACTS = join(HERE, "harness-contracts.json");

/** Договорите с харнеса (tools/agents/harness-contracts.json); липсващ файл → празен списък. */
export function loadContracts(file = CONTRACTS) {
  try { return JSON.parse(readFileSync(file, "utf8")).contracts || []; } catch { return []; }
}

/** Кои договори засяга ред от changelog-а (ключова дума, без значение регистъра). */
export function touchedContracts(line, contracts = loadContracts()) {
  const l = String(line || "").toLowerCase();
  return contracts.filter((c) => (c.keywords || []).some((k) => l.includes(String(k).toLowerCase()))).map((c) => c.id);
}
export const SOURCES = {
  docs: "https://code.claude.com/docs/llms.txt",
  changelog: "https://code.claude.com/docs/en/changelog.md",
  engineering: "https://www.anthropic.com/engineering",
};

// Редовете от changelog-а, които засягат НАШИЯ агентски процес (агенти, куки, умения, права, кеш,
// памет, оркестрация). Останалото (VSCode теми, Windows поправки) е шум за флота.
export const RELEVANT = /subagent|sub-agent|agent|hook|skill|frontmatter|permission|sandbox|cache|ttl|workflow|memory|CLAUDE\.md|settings|MCP|plugin|worktree|compact|context|effort|model|fork|background|eval/i;

/** Текст от мрежата → само печатни знаци, без управляващи, с таван на дължината. */
export function clean(s, max = 200) {
  const t = String(s || "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** llms.txt → [{ url, title }] (уникални по url). */
export function parseDocsIndex(text) {
  const seen = new Map();
  for (const m of String(text).matchAll(/\[([^\]]+)\]\((https:\/\/code\.claude\.com\/docs\/en\/[^)\s]+)\)/g))
    if (!seen.has(m[2])) seen.set(m[2], { url: m[2], title: clean(m[1], 120) });
  return [...seen.values()];
}

/** changelog.md → [{ version, date, bullets }] в реда на страницата (най-новата първа). */
export function parseChangelog(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split("\n")) {
    const v = line.match(/^\*\*(\d+\.\d+\.\d+)\*\*\s*$/) || line.match(/^##\s+(\d+\.\d+\.\d+)\b/);
    if (v) { cur = { version: v[1], date: "", bullets: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if (!cur.date && /^[A-Z][a-z]+ \d{1,2}, \d{4}\s*$/.test(line.trim())) { cur.date = line.trim(); continue; }
    const b = line.match(/^\s*[*-]\s+(.+)$/);
    if (b) cur.bullets.push(clean(b[1].replace(/\\\[/g, "[").replace(/\\\]/g, "]"), 300));
  }
  return out;
}

/** Страницата на блога → [{ slug, title }]. Статиите сочат /engineering/<slug> или /research/<slug>. */
export function parseEngineering(html) {
  const seen = new Map();
  for (const m of String(html).matchAll(/href="\/(?:engineering|research)\/([A-Za-z0-9-]+)"[^>]*>([^<]{3,})</g))
    if (!seen.has(m[1])) seen.set(m[1], { slug: m[1], title: clean(m[2].replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'"), 140) });
  return [...seen.values()];
}

/** a > b за версии x.y.z. */
export function newer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b || "0.0.0").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

/**
 * Сравнява предишната снимка с текущата. Липсващ източник в текущата (неуспешно сваляне) не
 * изтрива нищо — затова снимката на този източник се пренася непроменена.
 */
export function diffSnapshot(prev, cur, contracts = loadContracts()) {
  const p = prev || {};
  const docsBefore = new Set((p.docs || []).map((d) => d.url));
  const docsNow = new Set((cur.docs || []).map((d) => d.url));
  const engBefore = new Set((p.engineering || []).map((e) => e.slug));
  const versions = (cur.changelog || []).filter((r) => newer(r.version, p.changelogVersion));
  return {
    newDocs: cur.docs ? cur.docs.filter((d) => !docsBefore.has(d.url)) : [],
    removedDocs: cur.docs ? (p.docs || []).filter((d) => !docsNow.has(d.url)) : [],
    newVersions: versions.map((r) => ({ ...r, relevant: r.bullets.filter((b) => RELEVANT.test(b)) })),
    newPosts: cur.engineering ? cur.engineering.filter((e) => !engBefore.has(e.slug)) : [],
    // Редове, които засягат допускане на агентския ни слой — оценяват се първи (2.1.89 мина незабелязан).
    contractHits: versions.flatMap((r) => r.bullets.map((b) => ({ version: r.version, line: b, contracts: touchedContracts(b, contracts) })))
      .filter((h) => h.contracts.length),
  };
}

/** Новата снимка: това, което се свали, плюс непроменено пренесеното от старата. */
export function nextState(prev, cur, today) {
  const p = prev || {};
  const top = (cur.changelog || [])[0];
  return {
    checkedAt: today,
    changelogVersion: top && newer(top.version, p.changelogVersion) ? top.version : p.changelogVersion || null,
    docs: cur.docs || p.docs || [],
    engineering: cur.engineering || p.engineering || [],
  };
}

export function renderReport(d, failed) {
  const lines = [];
  const none = !d.newDocs.length && !d.removedDocs.length && !d.newVersions.length && !d.newPosts.length;
  lines.push(none ? "Няма новости от последната проверка." : "Новости от последната проверка:");
  if (d.contractHits?.length) {
    lines.push("", `⚠ ЗАСЯГАТ ДОГОВОР С ХАРНЕСА (${d.contractHits.length}) — оцени първо, после node tools/agents/live-gate.mjs:`);
    for (const h of d.contractHits.slice(0, 20)) lines.push(`  - ${h.version} [${h.contracts.join(", ")}] ${h.line}`);
    if (d.contractHits.length > 20) lines.push(`  … още ${d.contractHits.length - 20}`);
  }
  if (d.newVersions.length) {
    lines.push("", `Claude Code — ${d.newVersions.length} нови версии (${d.newVersions.map((v) => v.version).join(", ")}):`);
    for (const v of d.newVersions) {
      lines.push(`  ${v.version}${v.date ? " · " + v.date : ""} — ${v.relevant.length} от ${v.bullets.length} реда засягат агентския процес`);
      for (const b of v.relevant.slice(0, 15)) lines.push(`    - ${b}`);
      if (v.relevant.length > 15) lines.push(`    … още ${v.relevant.length - 15}`);
    }
  }
  if (d.newDocs.length) { lines.push("", `Нови страници в документацията (${d.newDocs.length}):`); for (const x of d.newDocs) lines.push(`  - ${x.title} — ${x.url}`); }
  if (d.removedDocs.length) { lines.push("", `Махнати страници (${d.removedDocs.length}):`); for (const x of d.removedDocs) lines.push(`  - ${x.title} — ${x.url}`); }
  if (d.newPosts.length) { lines.push("", `Нови статии в инженерния блог (${d.newPosts.length}):`); for (const x of d.newPosts) lines.push(`  - ${x.title} — https://www.anthropic.com/engineering/${x.slug}`); }
  if (failed.length) lines.push("", `Не се свалиха: ${failed.join(", ")} — за тях снимката остава старата.`);
  return lines.join("\n");
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "user-agent": "carbon-stealth-anthropic-watch" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function main(argv) {
  const today = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);
  const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;

  const cur = {}, failed = [];
  const parsers = { docs: parseDocsIndex, changelog: parseChangelog, engineering: parseEngineering };
  await Promise.all(Object.entries(SOURCES).map(async ([k, url]) => {
    try {
      const parsed = parsers[k](await get(url));
      if (!parsed.length) throw new Error("празно след разбора — форматът на страницата се е сменил?");
      cur[k] = parsed;
    } catch (e) { failed.push(`${k} (${clean(e.cause?.code || e.message, 80)})`); }
  }));

  const diff = diffSnapshot(prev, cur);
  if (argv.includes("--update") && failed.length < Object.keys(SOURCES).length)
    writeFileSync(STATE, JSON.stringify(nextState(prev, cur, today), null, 2) + "\n");

  if (argv.includes("--json")) return emitJson({ checkedAt: today, since: prev?.checkedAt || null, failed, ...diff }, failed.length ? 1 : 0);
  console.log(`anthropic-watch · ${today} · предишна проверка: ${prev?.checkedAt || "няма"} · версия до: ${prev?.changelogVersion || "—"}\n`);
  console.log(renderReport(diff, failed));
  if (argv.includes("--update")) console.log(`\n↳ снимката е записана в ${STATE.slice(STATE.indexOf("tools/"))}`);
  finish(failed.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
