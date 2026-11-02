#!/usr/bin/env node
// model-policy.mjs — рутинг на модел/усилие по агент + одит спрямо декларираното.
//
// Защо: всичките агенти вървят на `opus`. За дълбоко разсъждение / безопасно-критично това е
// правилно; за механично/авторско по-евтин модел върши работа без загуба на качество → разходен
// лост. Този инструмент НЕ сменя нищо по подразбиране — само докладва препоръка vs декларирано.
// Смяната е реална промяна в поведението → изисква изричен `--apply` и човешко решение.
//
//   node tools/agents/model-policy.mjs            # одит: препоръка vs декларирано
//   node tools/agents/model-policy.mjs --json
//   node tools/agents/model-policy.mjs --apply     # запиши препоръчания модел във frontmatter (опция)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const APPLY = argv.includes("--apply");

// Политика: TIER_A = дълбоко разсъждение / безопасно-критично / cross-family съд → opus.
// TIER_B = способно, но по-евтино стига (структурно/авторско/механично) → sonnet.
// TIER_C = чисто механично, детерминистично, без преценка → haiku ($1/$5, 3× по-евтин от sonnet).
// Обосновка на реда: пари/право/фискал/сигурност/клинично/стат/AI-канон → A. Останалото → B.
const TIER_A = new Set([
  "kodadjiyata", "kachestveniyat", "pravniyat-razbirach", "ai-djiyata", "kasadjiyata",
  "treydara", "prodavacha", "tayniyat-agent", "prevodach", "analizatora", "nabludatelya", "razbivacha",
  // goladjiyata: риск-първо (близнак на treydara) — пари/Kelly/калибрация → дълбочината струва.
  "goladjiyata",
  // vps-adjiyata: opus остава след сравнителна проба opus↔sonnet (2026-07-19) — LLM-съдия
  // с ВИСОКА увереност даде дълбочинна преднина на opus (реален deploy edge case, четене на
  // deploy.sh). Продукционен деплой = дълбочината струва. Останалите tier-B минаха паритет → sonnet.
  "vps-adjiyata",
  // asansyorchika: безопасно-критично — норми за асансьори (UNI EN 81, UNI 10411, DPR 162/1999);
  // грешно издание или стойност стига до relazione di calcolo, подписвана от инженер → opus/high.
  "asansyorchika",
  // frezadjiyata: физически риск — G-code тича на машина с шпиндел 18 000 об/мин; грешен диалект (G41 в
  // GRBL), бърз ход под R-равнината или заобиколен cncBlockers чупи фреза/машина и бракува лист. Грешката е
  // необратима и неуловима от тестовете на двигателя → opus/high като asansyorchika. Сваляне само по
  // eval-паритет (сляпо двойково, правилото на собственика „качеството първо“), не на око.
  "frezadjiyata",
]);
// TIER_C (haiku) е ПРАЗЕН по подразбиране — умишлено. Свалянето на агент на haiku е промяна в
// поведението и изисква СЪЩОТО доказателство като opus→sonnet: паритет през `agent-eval` (golden
// маркери + сляпо двойково съдийство). Никой агент не се слага тук „на око"; всеки наш агент носи
// домейнова преценка, а тя не е механична. Празно = честно: не сме доказали haiku-паритет за никого.
const TIER_C = new Set([]);

// Усилие (effort: reasoning бюджет) — ортогонален лост на модела. Реже ИЗХОДНИ (reasoning) токени.
// high = безопасно-критично / дълбок ревю → всички TIER_A. low = механично/шаблонно. иначе medium.
// LOW_EFFORT: най-шаблонно-процедурните — upsert seed / clip-repurpose. Тесен, защитим списък;
// разширяване = през eval-паритет, не на око (същата дисциплина като TIER_C).
const LOW_EFFORT = new Set(["siydara", "socialdjiyata"]);
// Tier A на medium по ИЗМЕРВАНЕ (31.10.2026, пилот live-run --set effort=medium, k=2): Кодаджията
// $1.05 → $0.64 (−39%), Качествения $0.90 → $0.57 (−37%), golden 2/2 и в двете рамена; сляпо двойково
// съдийство за Кодаджията 1:1 (истински находки 4/5 и 4/3). „Prompting Claude Opus 5.5“: medium на 5.5 ≥
// high на Opus 5. Преводача остана high (−4%). Връщане: обратно в TIER_A без изключение + жив гейт.
// Пилот 02.11.2026 (същият метод, k=2 на два spec-а): Разбивача medium −23% ($1.63 → $1.25), golden 4/4 и в
// двете рамена, НО сляпото двойково съдийство (Кодаджията, находки сверени в кода) — high 3 · medium 0 · равно 1:
// high дава повече различни истински находки и по-точни редове → остава high. Правният Разбирач −3% → остава high.
// Правило на собственика (02.11.2026): „качеството първо — по-добро и по-бързо, малко по-скъпо е приемливо“;
// вдигане само при ИЗМЕРЕНО по-добро качество (сляпо двойково, изолирани опити). Дизайнера medium→high:
// маркери 26/26 и в двете, сляпо 2:2, но 2,1× по-бавно (141 → 299 s) и +64% ($0.47 → $0.77) → остава medium.
// Сийдъра и Социалджията low→medium (sonnet, k=2 на два spec-а, изолирани опити): маркери 26/26 и в двете;
// сляпо Сийдъра 2:2 (точки 52:50 за low), Социалджията 2:2 (53:48 за medium — в шума); цена +5%, време +33%/+25%
// → остават low. Съдийството хвана слабост и на двете усилия („Сигурно“ за блог на трета страна) → обучена.
const MEDIUM_MEASURED = new Set(["kodadjiyata", "kachestveniyat"]);
// Изпитателят medium→high по ИЗМЕРВАНЕ (02.11.2026, sonnet, k=2 на два spec-а, всеки опит в свое копие и своя
// сесия): маркери 12/12 и в двете; сляпо двойково (Качествения, сверено с репото) — high 4 · medium 0, точки
// 48:37. medium пишеше 9 регистрации при твърд лимит 8/час (Nexus/server/src/server.ts:151) → тестът пада с 429.
// Цена +28% ($0.52 → $0.67), време +54% (82 → 126 s) — по правилото на собственика качеството печели.
const HIGH_MEASURED = new Set(["izpitatelya"]);

const REASON = {
  A: "дълбоко разсъждение / безопасно-критично (пари·право·фискал·сигурност·клинично·стат) → opus + effort:high",
  B: "структурно/авторско/механично — способно на sonnet без загуба на качество → разходен лост",
  C: "чисто механично/детерминистично → haiku (само след eval-паритет; засега празно)",
  effort: "high=критично/дълбоко (TIER_A) · low=шаблонно/механично (LOW_EFFORT) · medium=останалите",
};
const rec = (id) => (TIER_C.has(id) ? "haiku" : TIER_A.has(id) ? "opus" : "sonnet");
const recEffort = (id) => (HIGH_MEASURED.has(id) || (TIER_A.has(id) && !MEDIUM_MEASURED.has(id)) ? "high" : LOW_EFFORT.has(id) ? "low" : "medium");

function agentIds() {
  return readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")).sort();
}
function frontModel(md) { const m = md.match(/^model:\s*(.+)$/m); return m ? m[1].trim() : null; }
function frontEffort(md) { const m = md.match(/^effort:\s*(.+)$/m); return m ? m[1].trim() : null; }

// Запиши effort във frontmatter: замени реда, ако го има; иначе го добави веднага след `model:`.
function withEffort(md, effort) {
  if (/^effort:\s*.+$/m.test(md)) return md.replace(/^effort:\s*.+$/m, "effort: " + effort);
  return md.replace(/^(model:\s*.+)$/m, "$1\neffort: " + effort);
}

const rows = [];
for (const id of agentIds()) {
  const file = join(AGENTS_DIR, id + ".md");
  let md = readFileSync(file, "utf8");
  const actual = frontModel(md);
  const actualEffort = frontEffort(md);
  const want = rec(id);
  const wantEffort = recEffort(id);
  const tier = TIER_C.has(id) ? "C" : TIER_A.has(id) ? "A" : "B";
  const diverges = actual && actual !== want;
  const effortDiverges = actualEffort !== wantEffort;
  rows.push({ id, tier, actual, recommended: want, diverges, effort: actualEffort, recommendedEffort: wantEffort, effortDiverges });
  if (APPLY && (diverges || effortDiverges)) {
    if (diverges) md = md.replace(/^model:\s*.+$/m, "model: " + want);
    if (effortDiverges) md = withEffort(md, wantEffort);
    writeFileSync(file, md);
  }
}

const diverging = rows.filter((r) => r.diverges);
const effortDiverging = rows.filter((r) => r.effortDiverges);
const toSonnet = diverging.filter((r) => r.recommended === "sonnet").length;

if (JSON_OUT) {
  await emitJsonNow({
    policy: REASON, rows,
    diverging: diverging.length, effortDiverging: effortDiverging.length, applied: APPLY,
  }, 0);
}

console.log(`\n🎛  Рутинг на модел + усилие по агент (${rows.length} агента)\n`);
console.log("  A = opus (дълбоко/критично) · B = sonnet (по-евтино стига) · C = haiku (механично; засега 0)\n");
for (const r of rows) {
  const mFlag = r.diverges ? "\x1b[33mM\x1b[0m" : "\x1b[90m·\x1b[0m";
  const eFlag = r.effortDiverges ? "\x1b[36mE\x1b[0m" : "\x1b[90m·\x1b[0m";
  console.log(
    `  ${mFlag}${eFlag} ${r.id.padEnd(22)} tier ${r.tier}  ` +
    `модел ${(r.actual || "—").padEnd(7)}→${r.recommended.padEnd(7)}  ` +
    `усилие ${(r.effort || "—").padEnd(6)}→${r.recommendedEffort}`,
  );
}
if (APPLY) {
  console.log(`\n✎ приложено: ${diverging.length} модел + ${effortDiverging.length} усилие преместени към препоръката.`);
} else {
  console.log(`\nПрепоръка: ${toSonnet} агента (tier B) opus→sonnet · ${effortDiverging.length} агента с липсващо/разминаващо се усилие.`);
  console.log("M = моделът се разминава · E = усилието се разминава. Промяна в поведението — пусни с --apply само след човешко решение.");
}
process.exit(0);
