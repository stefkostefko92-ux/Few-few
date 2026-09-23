#!/usr/bin/env node
// .claude/hooks/memory-capture.mjs — SubagentStop hook (v6.0 самообучение).
//
// Чете stdin JSON от харнеса, изважда ПОСЛЕДНИЯ ```learn блок от транскрипта на
// субагента и го записва в .claude/agents/_memory/<agent>.md:
//   confidence: verified → „Проверени поуки"; иначе → „Карантина".
// Дедупира по нормализиран текст. При НОВА поука обновява и таблото
// (agents-dashboard/agents.json + вградения FALLBACK в index.html) с activity запис,
// за да „живее" страницата на агентите при всяко научено нещо. Винаги exit 0.
//
// Самоидентифициращ се: рутира по `agent:` ВЪТРЕ в блока, не по несигурно payload поле,
// и no-op-ва за всичко извън нашия списък (файлът на паметта трябва да съществува).

import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseFallback, replaceFallback } from "../../tools/lib/dashboard-fallback.mjs";
import { norm, addLessons, lessonIndex, lessonText, summarize, applyUpdate, countVerifiedText } from "../../tools/lib/memory-core.mjs";
import { publishLessons, pendingLessons, isGitRepo } from "../../tools/lib/memory-branch.mjs";
import { evalMode } from "../../tools/lib/eval-mode.mjs";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(HOOK_DIR, "..", "..");
const MEM_DIR = join(PROJECT_DIR, ".claude", "agents", "_memory");
const DASH_JSON = join(PROJECT_DIR, "agents-dashboard", "agents.json");
const DASH_HTML = join(PROJECT_DIR, "agents-dashboard", "index.html");
const LOCK_DIR = join(PROJECT_DIR, "agents-dashboard", ".sync.lock");
// Без cap на activity — целият поток на учене се пази (таблото го показва в dropdown).

function readStdin() { try { return readFileSync(0, "utf8"); } catch { return ""; } }

function collectText(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) collectText(n, out); return; }
  for (const [k, v] of Object.entries(node)) {
    if (k === "text" && typeof v === "string") out.push(v);
    else if (v && typeof v === "object") collectText(v, out);
  }
}

function transcriptText(path) {
  if (!path || !existsSync(path)) return "";
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { collectText(JSON.parse(t), out); } catch { /* skip */ }
  }
  return out.join("\n");
}

function lastLearnBlock(text) {
  const re = /```learn\s*\n([\s\S]*?)```/g;
  let m, last = null;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last;
}

// Нормализира етикета на увереност. ТИХ ПРОВАЛ, който това затваря: `PROCEDURE.md` (red line 3)
// учи всеки агент да ползва „Сигурно / Вероятно / Несигурно", а тук се приемаше само английското
// `verified` — така поука, писана точно по нашата собствена процедура, мълчаливо падаше в Карантина.
// В една вълна това изяде 22 поуки от 3 агента (letopisetsa 5/5, printadjiyata 5/8, 3d-maniac 8/11):
// hook-ът връщаше успех, файлът се пишеше, версията просто не мърдаше и никой не разбираше.
// Неразпознатите стойности пак падат към `unverified` — по-безопасната посока.
export const CONFIDENCE_SYNONYMS = {
  сигурно: "verified", потвърдено: "verified", проверено: "verified",
  вероятно: "probable", "по-вероятно": "probable", likely: "probable",
  несигурно: "unverified", непроверено: "unverified", quarantine: "unverified",
  hypothesis: "unverified", hypothese: "unverified", incertain: "unverified",
  uncertain: "unverified", unknown: "unverified",
};
export function normalizeConfidence(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (s === "verified" || s === "probable" || s === "unverified") return s;
  return CONFIDENCE_SYNONYMS[s] || "unverified";
}

function parseLearn(block) {
  const res = { agent: null, date: null, lessons: [] };
  let cur = null;
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/^\s*agent:\s*(.+)$/))) res.agent = m[1].trim().replace(/^["']|["']$/g, "");
    else if ((m = line.match(/^\s*date:\s*(.+)$/))) res.date = m[1].trim();
    // Приема и `text:`, и `lesson:` като начало на поука (агентите естествено варират ключа —
    // nabludatelya/analizatora ползваха `lesson:` и поуките им бяха тихо изхвърлени).
    else if ((m = line.match(/^\s*-\s*(?:text|lesson|insight|claim):\s*(.+)$/))) { cur = { text: m[1].trim().replace(/^["']|["']$/g, ""), confidence: "unverified", source: "", scope: "", reverify: "" }; res.lessons.push(cur); }
    else if (cur && (m = line.match(/^\s*confidence:\s*(.+)$/))) cur.confidence = normalizeConfidence(m[1]);
    else if (cur && (m = line.match(/^\s*source:\s*(.+)$/))) cur.source = m[1].trim();
    else if (cur && (m = line.match(/^\s*scope:\s*(.+)$/))) cur.scope = m[1].trim();
    else if (cur && (m = line.match(/^\s*re-?verify:\s*(\d{4}-\d{2}-\d{2}).*$/i))) cur.reverify = m[1].trim(); // #2 явен TTL за критичен факт
  }
  return res;
}


// Guardrail (flawlessness #10): НИКОГА тайна/ключ/токен в паметта — твърд гейт, не съвет.
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test|prod)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|\b(?:ya29|AQ)\.[0-9A-Za-z_-]{20,}|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const looksSecret = (s) => SECRET_RE.test(String(s));

// Анти устойчива-инжекция (persistent prompt injection): паметта се ИНЖЕКТИРА в
// контекста на всеки бъдещ старт (memory-preload) → зловреден сайт, който убеди агент
// да „научи" инструкция, я закотвя завинаги. Твърд дроп на поуки-инструкции:
// императиви за изпращане/изпълнение, смяна на роля/правила, exfil URL-и, скрити знаци.
const INJECTION_RE = new RegExp(
  [
    /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|earlier|above)\s+(?:instructions?|rules?|context)/.source,
    /(?:игнорирай|забрави|пренебрегни)\s+(?:всички\s+)?(?:предишн[\p{L}]*|горн[\p{L}]*|досегашн[\p{L}]*|тези|тукашн[\p{L}]*)\s+(?:инструкц[\p{L}]*|правил[\p{L}]*|указан[\p{L}]*)/u.source,
    /you\s+are\s+(?:now|no\s+longer)\s/.source,
    /(?:ти\s+(?:вече\s+)?си|отсега\s+си)\s+(?:друг|нов)\s+(?:агент|асистент)/.source,
    /(?:винаги|always)\s+(?:изпращай|изпрати|прати|send|post|forward|exfiltrate)\b/.source,
    /(?:изпращай|изпрати|прати|send|post|upload|forward)\b[^\n]{0,80}\b(?:към|to)\s+https?:\/\//.source,
    /curl\s+[^\n]*\|\s*(?:ba)?sh/.source,
    /(?:\.env|тайн[\p{L}]*|секрет[\p{L}]*|secrets?|credentials?|парол[\p{L}]*|токен[\p{L}]*|tokens?)[^\n]{0,60}\bhttps?:\/\//u.source,
    // Многоезично (продуктите са IT/DE/ES/BG/EN): игнорирай-правила + exfil към URL.
    /(?:ignora|dimentica|trascura)\s+(?:tutte\s+)?le\s+(?:istruzioni|regole)/u.source, // IT
    /(?:ignoriere|vergiss|missachte)\s+(?:alle\s+)?(?:vorherigen|obigen|bisherigen)\s+(?:anweisungen|regeln|befehle)/u.source, // DE
    /(?:ignora|olvida)\s+(?:todas\s+las\s+)?(?:instrucciones|reglas)\s+(?:anteriores|previas)/u.source, // ES
    /(?:sei\s+(?:ora|adesso)|du\s+bist\s+(?:jetzt|nun)|ahora\s+eres)\s/u.source, // IT/DE/ES смяна на роля
    /(?:invia|manda|inoltra|sende|schicke|leite|env[ií]a)\b[^\n]{0,80}\b(?:a|an|zu)\s+https?:\/\//u.source, // IT/DE/ES exfil→URL
    /[​-‏‪-‮⁦-⁩]/.source, // нулево-широки/bidi контролни знаци
  ].join("|"),
  "iu",
);
const looksInjection = (s) => INJECTION_RE.test(String(s));

// „Verified" иска РЕАЛЕН източник. Синтактична проверка (не семантична — hook-ът не отваря URL-а);
// curate + човек до push.
//
// ИЗРАВНЕНО С `hasSource` (tools/agents/oversee-lib.mjs). Дълго време двете функции даваха РАЗЛИЧЕН
// отговор за един и същ низ: куката (която решава дали поуката става ФАКТ) беше по-строга от
// одитора (който после я преглежда). Резултат: 74 поуки с напълно реален източник заседнаха в
// Карантина и никога не станаха знание — правни цитати с домейн без схема (`tita.bg/laws/427`),
// репо-пътища без номер на ред (`bot/src/utils/serverEventLog.js`), `discord.com/developers/docs`.
// Две дефиниции за едно понятие = тих отпад. Приемаме същите форми като `hasSource`; продължаваме
// да отхвърляме празнотата („N/A", „само коефициенти налични") — там няма какво да се провери.
// Внасяме КАНОНИЧНИЯ предикат — да не съществуват две дефиниции за „източник“ (точно това
// заклещи 74 реални поуки в Карантина).
// ВНИМАНИЕ: `export { x as y } from "..."` е РЕ-ЕКСПОРТ — изнася за други модули, но НЕ създава
// локална променлива. Първата версия беше само ре-експорт и `sourceIsReal(...)` вътре в main()
// хвърляше ReferenceError при ВСЯКО захващане — а fail-open catch-ът го маскираше до нула
// симптоми: учебният цикъл на целия флот мълчеше и изглеждаше „празен ден", не счупен.
import { isRealSource as sourceIsReal } from "../../tools/agents/oversee-lib.mjs";
export { sourceIsReal };

export { looksSecret, looksInjection };

function atomicWrite(file, content) {
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

// Сериен достъп до таблото в резервния път — оцелява при паралелни субагенти. mkdir е атомичен.
function withLock(fn) {
  for (let i = 0; i < 150; i++) {
    try { mkdirSync(LOCK_DIR); } catch { sleepMs(40); continue; }
    try { return fn(); } finally { try { rmdirSync(LOCK_DIR); } catch { /* ignore */ } }
  }
}
function sleepMs(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

// Брои булетите в раздела „Проверени поуки". `null` при липсващ/нечетим файл — тогава не пипаме
// полето (по-добре старо число, отколкото да занулим показателя). Броенето е в memory-core.
export function countVerified(agentId, dir = MEM_DIR) {
  let txt;
  try { txt = readFileSync(join(dir, `${agentId}.md`), "utf8"); } catch { return null; }
  return countVerifiedText(txt);
}

// РЕЗЕРВЕН път (само когато няма git): записва в работното дърво + таблото, както преди.
function writeWorkingTree(agentId, file, txt, s) {
  atomicWrite(file, txt);
  const lessons = countVerifiedText(txt);
  withLock(() => {
    if (existsSync(DASH_JSON)) {
      try {
        const j = JSON.parse(readFileSync(DASH_JSON, "utf8"));
        if (applyUpdate(j, agentId, s.activity, s.evoDetail, s.verifiedCount, lessons)) atomicWrite(DASH_JSON, JSON.stringify(j, null, 2) + "\n");
      } catch { /* ignore */ }
    }
    if (existsSync(DASH_HTML)) {
      try {
        // String-aware локаторът живее в tools/lib/dashboard-fallback.mjs (един парсер, не два).
        const h = readFileSync(DASH_HTML, "utf8");
        const fb = parseFallback(h);
        if (fb && applyUpdate(fb, agentId, s.activity, s.evoDetail, s.verifiedCount, lessons)) atomicWrite(DASH_HTML, replaceFallback(h, fb));
      } catch { /* ignore */ }
    }
  });
}

// Фонова синхронизация на agents/memory (fetch → обединяване → сгъване на main → push). Detached:
// не блокира агента (SubagentStop има timeout). AGENT_MEMORY_SYNC=0 я изключва (тестове/офлайн).
function bgSync() {
  if (process.env.AGENT_MEMORY_SYNC === "0") return;
  try {
    const child = spawn(process.execPath, [join(PROJECT_DIR, "tools", "lib", "memory-branch.mjs"), "--sync"],
      { cwd: PROJECT_DIR, detached: true, stdio: "ignore", env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR } });
    child.unref();
  } catch { /* никога не блокирай агента заради git */ }
}

// Къде отива поуката (2026-09-23). Дотук: работното дърво + `git add` + commit в КЛОНА НА ЗАДАЧАТА.
// Измерено: 562 проверени поуки в 32 клона никога не стигнаха до main (нова сесия тръгва от main и не
// ги вижда), а всяка поука пипаше таблото → осем от девет клона не се сливаха чисто. Сега поуката
// става commit в собствения клон `agents/memory` през plumbing (HEAD/индекс/работно дърво — непокътнати),
// memory-preload я вижда веднага, а PR-ът agents/memory → main я внася. Работното дърво се пише само
// ако няма git (резервен път) — иначе клонът на задачата остава чист от памет.
function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin()); } catch { /* ignore */ }

  // Прекъснат/сринат run → НЕ записвай „научено" (half-baked поука от недовършена мисъл).
  const stopReason = String(payload.stop_reason || payload.reason || payload.subtype || payload.status || "").toLowerCase();
  if (payload.interrupted === true || payload.is_error === true ||
      /\b(interrupt|cancel|abort|error|fail|timeout|max_turns|max_budget)\b/.test(stopReason)) process.exit(0);

  const tPath = payload.agent_transcript_path || payload.transcript_path || "";
  const text = transcriptText(tPath) || payload.last_assistant_message || "";
  // Жива проверка: входът е измислен → „поука" за него би отровила паметта. Нищо не се записва.
  if (evalMode(PROJECT_DIR)) process.exit(0);
  const block = lastLearnBlock(text);
  if (!block) process.exit(0);

  const parsed = parseLearn(block);
  if (!parsed.agent) process.exit(0);
  const file = join(MEM_DIR, `${parsed.agent}.md`);
  if (!existsSync(file)) process.exit(0); // не е от нашия списък — no-op

  const date = parsed.date || new Date().toISOString().slice(0, 10);
  const working = readFileSync(file, "utf8");
  // Дедупът вижда И поуките, които чакат в agents/memory — иначе същата поука се публикува повторно.
  const pending = pendingLessons(PROJECT_DIR, parsed.agent, working);
  const seen = lessonIndex(working, pending.length ? `## Проверени поуки\n${pending.join("\n")}\n` : "");

  const newV = [], newQ = [];
  for (const les of parsed.lessons) {
    if (!les.text || !les.source) continue; // източник или нищо
    if (looksSecret(les.text) || looksSecret(les.source)) continue; // тайна → НЕ записвай (твърд дроп)
    if (looksInjection(les.text) || looksInjection(les.scope) || looksInjection(les.source)) continue; // анти persistent injection
    // „Verified" иска реален източник; иначе пада в карантина (не вярвай на самооценката).
    let confidence = String(les.confidence || "").toLowerCase();
    if (confidence === "verified" && !sourceIsReal(les.source)) confidence = "unverified";
    const entry = `- **${date}:** ${les.text} _(${les.scope || "общо"}; ${confidence}; ${les.source}${les.reverify ? `; re-verify: ${les.reverify}` : ""})_`;
    if (seen.has(entry) || [...seen.exact].some((e) => e.includes(norm(les.text)))) continue;
    seen.exact.add(norm(entry));
    (confidence === "verified" ? newV : newQ).push(entry);
  }
  if (newV.length + newQ.length === 0) process.exit(0);

  let published = null;
  if (isGitRepo(PROJECT_DIR)) {
    try { published = publishLessons(PROJECT_DIR, { [parsed.agent]: { verified: newV, quarantine: newQ } }, { date }); } catch { published = null; }
  }
  if (published?.ok && !published.skipped?.includes(parsed.agent)) {
    bgSync();
    process.exit(0);
  }
  // Резервен път: няма git, агентът е нов (основата не го познава) или публикуването се провали.
  const r = addLessons(working, { verified: newV, quarantine: newQ });
  if (!r.added.verified.length && !r.added.quarantine.length) process.exit(0);
  writeWorkingTree(parsed.agent, file, r.txt, summarize(r.added.verified.map(lessonText), r.added.quarantine.map(lessonText), date));
  process.exit(0);
}

// Пусни main() САМО като CLI (SubagentStop hook) — иначе import от тест чете stdin и излиза.
if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch { process.exit(0); } // никога не блокирай агента заради паметта
}
