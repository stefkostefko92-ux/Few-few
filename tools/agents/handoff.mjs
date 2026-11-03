#!/usr/bin/env node
// handoff.mjs — парсер и валидатор на блока „## ПРЕДАВАНЕ" (договорът за колаборация).
//
// Защо съществува. `PROCEDURE.md` инжектира във ВСЕКИ агент правилото „завърши всеки отговор с
// блока ПРЕДАВАНЕ", за да получава следващият винаги ЕДНА структура. Но нищо не го проверяваше:
// `dod-check.mjs` гейтваше файл-базирани правила и обхвата, а самият договор за предаване беше
// проза. Агент можеше да завърши със свободен текст и веригата тихо се късаше — точно класът
// дефект, който търсим: доктрината казва Х, никой не проверява Х.
//
// Договорът (от PROCEDURE.md, дословно):
//   ## ПРЕДАВАНЕ
//   От: <агент> → Към: <агент/човек>
//   Статус: наред | има бележки | блокер
//   Находки: <всяка с файл:ред + увереност>
//   Изход/артефакт: <какво произведох>
//   Следваща стъпка: <какво прави следващият и защо>
//
//   node tools/agents/handoff.mjs <файл>      # провери блок в файл (изход 1 при нарушение)
//   node tools/agents/handoff.mjs --demo      # покажи валиден образец

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");

export const STATUSES = ["наред", "има бележки", "блокер"];
// „човек"/„човека"/„собственика" са легитимни адресати — ескалацията към човек е част от договора.
export const HUMAN_TARGETS = /^(човек|човека|човекът|собственик|собственика|собственикът|потребител|потребителя|потребителят)$/i;

export function knownAgentIds(dir = AGENTS_DIR) {
  try {
    return new Set(readdirSync(dir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
      .map((f) => f.replace(/\.md$/, "")));
  } catch { return null; }
}

// Извади блока ПРЕДАВАНЕ (последния, ако има няколко — предаването е ПОСЛЕДНОТО нещо в отговора).
export function extractBlock(text) {
  const s = String(text || "");
  const re = /^##\s*ПРЕДАВАНЕ\s*$/gim;
  let last = -1, m;
  while ((m = re.exec(s))) last = m.index;
  if (last < 0) return null;
  const after = s.slice(last);
  // Блокът свършва на следващото `## ` заглавие (но не на самото ПРЕДАВАНЕ).
  const end = after.slice(1).search(/^##\s(?!.*ПРЕДАВАНЕ)/m);
  return end >= 0 ? after.slice(0, end + 1) : after;
}

const FIELD = (block, name) => {
  // Полетата може да са в код-блок, с водещи `- `, с **удебеляване** — приемаме всички варианти.
  const re = new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${name}(?:\\*\\*)?\\s*:\\s*(.*)$`, "im");
  const m = block.match(re);
  return m ? m[1].replace(/\*\*/g, "").trim() : null;
};

// `файл:ред` — същият смисъл като в hasSource: път с разширение + двоеточие + число.
const FILE_LINE = /\b[\w./-]+\.\w{1,6}:\d+\b/;
// Етикет на увереност (red line 3). Приемаме и български, и английски.
// ВНИМАНИЕ: `\b` в JS е ASCII-базирана — между `(` и `С` тя НЕ се задейства, защото кирилицата не е
// `\w`. Затова `/\bсигурно\b/` мълчаливо не хваща нищо в български текст. Ползваме Unicode-осъзнати
// граници (`\p{L}` с флаг `u`). Уловено от собствения smoke тест върху образеца в този файл.
const CONFIDENCE = /(?<!\p{L})(сигурно|вероятно|несигурно|verified|probable|unverified)(?!\p{L})/iu;

// Чиста валидация — без I/O, за да е тестваема и преизползваема (hook + CLI + eval).
export function validateHandoff(text, { agentIds = null, requireBlock = true } = {}) {
  const problems = [];
  const block = extractBlock(text);
  if (!block) {
    if (requireBlock) problems.push({ field: "блок", msg: "липсва блокът „## ПРЕДАВАНЕ“ — веригата се къса тук: следващият агент няма структура, която да прочете" });
    return { ok: !requireBlock, block: null, fields: {}, problems };
  }

  const from = FIELD(block, "От");
  const to = FIELD(block, "Към");
  const status = FIELD(block, "Статус");
  const findings = FIELD(block, "Находки");
  const artifact = FIELD(block, "Изход\\/артефакт") || FIELD(block, "Изход");
  const next = FIELD(block, "Следваща стъпка");

  // „От: X → Към: Y" на един ред е каноничният вид; тогава `От` носи и двете.
  let fromV = from, toV = to;
  if (from && /→|->/.test(from) && !to) {
    const parts = from.split(/→|->/);
    fromV = parts[0].trim();
    toV = (parts[1] || "").replace(/^\s*Към\s*:\s*/i, "").trim();
  } else if (from && /→|->/.test(from)) {
    fromV = from.split(/→|->/)[0].trim();
  }

  if (!fromV) problems.push({ field: "От", msg: "липсва „От:“ — не се знае кой предава" });
  if (!toV) problems.push({ field: "Към", msg: "липсва „Към:“ — предаване без адресат не е предаване" });

  // Адресатът трябва да е познат агент или човек. Измислено име = веригата сочи в нищото.
  if (toV && agentIds) {
    const clean = toV.replace(/[„“"'`*]/g, "").trim().split(/[\s,(]/)[0];
    if (!agentIds.has(clean) && !HUMAN_TARGETS.test(clean))
      problems.push({ field: "Към", msg: `непознат адресат „${clean}" — трябва да е id на наш агент или човек` });
  }

  if (!status) problems.push({ field: "Статус", msg: "липсва „Статус:“" });
  else {
    const norm = status.toLowerCase().replace(/[.„“"']/g, "").trim();
    if (!STATUSES.some((s) => norm.startsWith(s)))
      problems.push({ field: "Статус", msg: `„${status}" не е от договора (${STATUSES.join(" | ")})` });
  }

  if (!artifact) problems.push({ field: "Изход/артефакт", msg: "липсва „Изход/артефакт:“ — следващият не знае какво е произведено" });
  if (!next) problems.push({ field: "Следваща стъпка", msg: "липсва „Следваща стъпка:“ — веригата спира без да каже какво следва" });

  // Находките са задължителни само когато има какво да се предаде нататък. При „наред" празно е ок.
  const statusNorm = (status || "").toLowerCase();
  const hasNotes = /бележки|блокер/.test(statusNorm);
  if (hasNotes) {
    if (!findings || /^(няма|—|-|нула)$/i.test(findings.trim())) {
      problems.push({ field: "Находки", msg: `Статус „${status}" без находки — щом не е „наред", трябва да се каже КАКВО не е наред` });
    } else {
      // Red line 1 + 3: всяка находка носи файл:ред и етикет на увереност.
      if (!FILE_LINE.test(findings) && !/https?:\/\//.test(findings))
        problems.push({ field: "Находки", msg: "находките нямат `файл:ред` (или URL) — закон „източник или мълчание“" });
      if (!CONFIDENCE.test(findings))
        problems.push({ field: "Находки", msg: "находките нямат етикет на увереност (Сигурно/Вероятно/Несигурно) — red line 3" });
    }
  }

  return {
    ok: problems.length === 0,
    block,
    fields: { from: fromV, to: toV, status, findings, artifact, next },
    problems,
  };
}

const DEMO = `## ПРЕДАВАНЕ
От: kodadjiyata → Към: izpitatelya
Статус: има бележки
Находки: linketto/src/lib/jsonld.ts:14 — липсва escape на U+2028 (Сигурно, възпроизведено с реален вход)
Изход/артефакт: ревю на diff-а + минимална поправка в jsonld.ts
Следваща стъпка: Изпитателят пише e2e за XSS вектора, преди merge`;

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--demo")) { console.log(DEMO); process.exit(0); }
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file || !existsSync(file)) { console.error("употреба: handoff.mjs <файл> | --demo"); process.exit(2); }
  const r = validateHandoff(readFileSync(file, "utf8"), { agentIds: knownAgentIds() });
  if (r.ok) { console.log(`✓ ПРЕДАВАНЕ: валиден блок (${r.fields.from} → ${r.fields.to}, ${r.fields.status})`); process.exit(0); }
  console.error(`✗ ПРЕДАВАНЕ: ${r.problems.length} нарушения на договора:`);
  for (const p of r.problems) console.error(`    [${p.field}] ${p.msg}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
