#!/usr/bin/env node
// memory-freshness.mjs — срок на годност за ПАМЕТТА на флота.
//
// Защо: 76% от проверените поуки (2818 от 3705) стъпват на ВЪНШЕН източник, сверен ВЕДНЪЖ, и само
// 2.8% носят изричен срок. `version-freshness` пази npm версиите, `claims-audit` — малък регистър
// правни твърдения; останалите ~2700 поуки нямаха НИКАКЪВ механизъм. Измерено на 2026-08-04:
// паметта още НЕ е стара (всичко е юни–юли 2026) — точно затова механизмът се слага СЕГА, преди
// гниенето, а не като аларма за вече изгубено знание.
//
// Класовете са изведени от РЕАЛНО цитираните домейни, не от предположение (топ: developer.chrome.com
// 156, docs.stripe.com 107, docs.discord.com 105, developer.apple.com 97, prisma.io 66, playwright.dev 59):
//   • ПЛАТФОРМА/ВЕНДОР (Apple/Google/Chrome/Play/Meta/Stripe/Discord) — политики и API се менят често,
//     а цената на остаряло знание е отказ от ревю или счупено плащане → 180 дни.
//   • РАМКА/ДОКОВЕ (Prisma/Playwright/Next/Vitest/MSW/React…) — вървят с мажорните версии → 365 дни.
//   • СТАНДАРТ/МЕТОД/РЕПО (W3C/RFC/WCAG/методология/наши пътища) — текстът е стабилен; репо-пътищата
//     се пазят отделно от deep-audit → 730 дни.
// Изричен `re-verify: YYYY-MM-DD` в поуката ПОБЕЖДАВА класа (човекът знае по-добре).
//
// ГЕЙТЪТ съди ИЗМЕРВАНЕТО, не размера на опашката — същото правило като `defect-rate`: да намериш
// просрочени поуки е ДОБРЕ, а да не мериш е дефект. Иначе гейтът щеше да е вечно червен и хората
// щяха да го изключат.
//
//   node tools/agents/memory-freshness.mjs            # отчет
//   node tools/agents/memory-freshness.mjs --top 20   # опашка за пресверяване (най-спешното първо)
//   node tools/agents/memory-freshness.mjs --record   # месечна снимка (тренд на опашката)
//   node tools/agents/memory-freshness.mjs --check    # гейт: измерването е живо и трайно

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MEM = join(ROOT, ".claude", "agents", "_memory");
const SNAP = join(HERE, "evals", "memory-freshness.jsonl");
const GITIGNORE = join(ROOT, ".gitignore");
const SNAP_TTL_DAYS = 75; // месечни точки + толеранс (както pressure.jsonl)

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const CHECK = argv.includes("--check");
const RECORD = argv.includes("--record");
const TOP = argv.includes("--top") ? Number(argv[argv.indexOf("--top") + 1]) || 20 : 0;
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);

// ── Класове волатилност ─────────────────────────────────────────────────────
export const CLASSES = [
  { id: "платформа", days: 180, re: /developer\.apple\.com|developer\.android\.com|play\.google\.com|support\.google\.com|developer\.chrome\.com|chromewebstore|developers\.facebook|developers\.google\.com|docs\.stripe\.com|stripe\.com|discord\.com\/developers|docs\.discord/i },
  { id: "рамка", days: 365, re: /prisma\.io|playwright\.dev|nextjs\.org|vitest\.dev|mswjs\.io|react\.dev|testing-library\.com|nodejs\.org|vuejs|expressjs|tailwindcss|docs\.npmjs/i },
  { id: "стандарт", days: 730, re: /w3\.org|rfc-editor|ietf\.org|whatwg|eur-lex|europa\.eu|iso\.org|martinfowler|kentcdodds|owasp\.org/i },
];
const DEFAULT_CLASS = { id: "външно", days: 365 };
// Поука БЕЗ външен източник (методология, доктрина, наш код) НЕ гние по календар: методът не
// остарява, а репо-пътищата се пазят от `deep-audit` (dead-mem-path). Да ѝ сложа срок значи да
// произведа опашка от стотици „просрочени" неща, които никой не може да пресвери срещу нищо —
// фалшив показател, който обезсмисля целия механизъм.
const NO_EXPIRY = { id: "без външен източник", days: null };

/** Класът на една поука: изричен re-verify побеждава; после домейн; без URL → не изтича. */
export function classify(line) {
  for (const c of CLASSES) if (c.re.test(line)) return c;
  return /https?:\/\//.test(line) ? DEFAULT_CLASS : NO_EXPIRY;
}

const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Всички проверени поуки с дата, клас и краен срок. */
export function collect({ dir = MEM } = {}) {
  const out = [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && !["SECURITY.md", "PROTOCOL.md"].includes(f));
  for (const f of files) {
    const agent = f.replace(/\.md$/, "");
    const L = readFileSync(join(dir, f), "utf8").split("\n");
    const p = L.findIndex((l) => /^##\s*Проверени поуки/.test(l));
    const q = L.findIndex((l) => /^##\s*Карантина/.test(l));
    if (p < 0) continue;
    for (const l of L.slice(p + 1, q < 0 ? L.length : q)) {
      if (!/^-\s/.test(l)) continue;
      const dm = l.match(/\*\*(\d{4}-\d{2}-\d{2})/);
      if (!dm) continue;                                   // без дата → не може да се съди срок
      const explicit = (l.match(/re-verify:\s*(\d{4}-\d{2}-\d{2})/i) || [])[1];
      const cls = classify(l);
      out.push({
        agent, date: dm[1], cls: explicit ? "изричен" : cls.id,
        due: explicit || (cls.days == null ? null : addDays(dm[1], cls.days)),
        text: l.slice(2, 120).replace(/\s+/g, " "),
      });
    }
  }
  return out;
}

export function summarize(items, today = TODAY) {
  const byClass = {}, byAgent = {};
  const overdue = [];
  for (const it of items) {
    byClass[it.cls] = (byClass[it.cls] || 0) + 1;
    if (it.due && it.due < today) {
      overdue.push(it);
      byAgent[it.agent] = (byAgent[it.agent] || 0) + 1;
    }
  }
  overdue.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  // Най-близкото предстоящо изтичане — показва кога опашката ще се напълни.
  const upcoming = items.filter((i) => i.due && i.due >= today).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
  return { total: items.length, byClass, overdue, byAgent, nextDue: upcoming ? upcoming.due : null };
}

// ── Снимка (тренд на опашката) ──────────────────────────────────────────────
const parseJsonl = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean) : [])
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

export function recordSnapshot({ file = SNAP, today = TODAY, sum } = {}) {
  const month = today.slice(0, 7);
  const rest = parseJsonl(file).filter((p) => p.month !== month);
  const point = { month, date: today, total: sum.total, overdue: sum.overdue.length, byClass: sum.byClass };
  writeFileSync(file, [...rest, point].map((p) => JSON.stringify(p)).join("\n") + "\n");
  return point;
}

/** Гейтът съди ИЗМЕРВАНЕТО (канал жив, траен, свеж), НЕ броя просрочени. */
export function measurementHealth({ file = SNAP, today = TODAY, gitignorePath = GITIGNORE } = {}) {
  const problems = [];
  const rel = "tools/agents/evals/memory-freshness.jsonl";
  const gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (gi.split("\n").map((l) => l.trim()).some((l) => l === rel || l === "memory-freshness.jsonl"))
    problems.push(`${rel} е в .gitignore — опашката губи история при нов клон.`);
  const hist = parseJsonl(file);
  if (!hist.length) problems.push(`няма нито една снимка в ${rel} — пусни: memory-freshness --record`);
  else {
    const last = hist[hist.length - 1];
    const age = Math.round((new Date(today) - new Date(last.date)) / 86400000);
    if (age > SNAP_TTL_DAYS) problems.push(`последната снимка е отпреди ${age} дни (таван ${SNAP_TTL_DAYS}) — пусни --record`);
  }
  return { problems, history: hist };
}

async function main() {
  const items = collect();
  const sum = summarize(items);
  if (RECORD) {
    const p = recordSnapshot({ sum });
    console.log(`✎ снимка за ${p.month}: ${p.total} поуки · ${p.overdue} просрочени`);
  }
  const health = measurementHealth();

  if (JSON_OUT) await emitJsonNow({ date: TODAY, ...sum, overdue: sum.overdue.length, health }, CHECK && health.problems.length ? 1 : 0);

  const g = (s) => `\x1b[32m${s}\x1b[0m`, r = (s) => `\x1b[31m${s}\x1b[0m`, y = (s) => `\x1b[33m${s}\x1b[0m`, d = (s) => `\x1b[90m${s}\x1b[0m`;
  console.log(`\n⏳  Срок на годност на паметта — ${sum.total} проверени поуки с дата\n`);
  for (const [c, n] of Object.entries(sum.byClass).sort((a, b) => b[1] - a[1])) {
    const days = CLASSES.find((x) => x.id === c)?.days;
    const label = c === NO_EXPIRY.id ? "не изтича (метод/наш код)" : c === "изричен" ? "по поуката" : (days || DEFAULT_CLASS.days) + " дни";
    console.log(`    ${c.padEnd(22)} ${String(n).padStart(5)}   ${d(label)}`);
  }
  console.log(`\n  Просрочени днес: ${sum.overdue.length ? r(sum.overdue.length) : g("0")}` +
    (sum.nextDue ? d(`   · следващо изтичане: ${sum.nextDue}`) : ""));
  if (sum.overdue.length) {
    const top = Object.entries(sum.byAgent).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  По агент: ${top.map(([a, n]) => `${a} ${n}`).join(" · ")}`);
  }
  if (TOP) {
    console.log(`\n  Опашка за пресверяване (най-спешното първо):`);
    for (const it of sum.overdue.slice(0, TOP)) console.log(`    ${it.due}  ${it.agent.padEnd(20)} ${d(it.text.slice(0, 70))}`);
    if (!sum.overdue.length) console.log(d("    (празно — нищо не е просрочено)"));
  }
  console.log(`\n  ${d("Гейтът съди ИЗМЕРВАНЕТО, не броя просрочени: да ги намериш е добре, да не мериш е дефект.")}`);
  if (health.problems.length) { console.log(r(`\n✗ измерването не е здраво:`)); for (const p of health.problems) console.log(`    ${p}`); }
  else console.log(g(`\n✓ измерването е живо: снимката е в git и е свежа.`));
  console.log("");
  process.exit(CHECK && health.problems.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
