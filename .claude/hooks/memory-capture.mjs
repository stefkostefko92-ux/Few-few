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
import { CREDENTIAL } from "../../tools/lib/secret-patterns.mjs";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || join(HOOK_DIR, "..", "..");
const MEM_DIR = join(PROJECT_DIR, ".claude", "agents", "_memory");
const DASH_JSON = join(PROJECT_DIR, "agents-dashboard", "agents.json");
const DASH_HTML = join(PROJECT_DIR, "agents-dashboard", "index.html");
const LOCK_DIR = join(PROJECT_DIR, "agents-dashboard", ".sync.lock");
// Без cap на activity — целият поток на учене се пази (таблото го показва в dropdown).

function readStdin() { try { return readFileSync(0, "utf8"); } catch { return ""; } }

// САМО текстът, който агентът е написал (assistant → content[].type === "text"). Преди се събираше всеки
// „text“ възел в транскрипта, вкл. tool_result: прочетен файл/страница/issue с ```learn блок ставаше
// „поука“ (Разбивача, 2026-09-24 — възпроизведено; LLM01). Недоверено съдържание е данни, не памет.
export function assistantTexts(lines) {
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    const m = o?.message;
    if (o?.type !== "assistant" || m?.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const c of m.content) if (c?.type === "text" && typeof c.text === "string") out.push(c.text);
  }
  return out;
}

function transcriptText(path) {
  if (!path || !existsSync(path)) return "";
  return assistantTexts(readFileSync(path, "utf8").split("\n")).join("\n");
}

// Оградата е на СОБСТВЕН ред (и отварящата, и затварящата): „```learn“ в средата на изречение (напр.
// поука, която описва самата кука) иначе отрязваше блока и ученето изчезваше.
export function lastLearnBlock(text) {
  const re = /^[ \t]*```learn[ \t]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
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

export function parseLearn(block) {
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
  if (!res.lessons.length) res.lessons = inlineLessons(block);
  return res;
}

// Резервен формат: поука като свободен булет с полетата в същия ред —
// „- 2026-09-24: текст… confidence: verified; source: файл:ред“. Сийдъра предаде 25 проверени поуки
// точно така (2026-09-24) и парсерът намери НУЛА — ученето тихо изчезна. Същите проверки важат
// (тайна, инжекция, реален източник за verified), тук само се разчита формата.
export function inlineLessons(block) {
  const out = [], entries = [];
  // Булет + редовете под него (полетата често продължават на следващ ред) = една поука.
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) entries.push(line.slice(2));
    else if (line && entries.length && !/^(agent|date|lessons):/i.test(line)) entries[entries.length - 1] += " " + line;
  }
  for (const body of entries) {
    // Форматът на самия файл памет: „**дата:** текст _(scope; confidence; source)_“. Конвейера и
    // Принтаджията предадоха по 25 поуки точно така (2026-09-24) — пак НУЛА, пак тихо.
    const e = body.match(/^\*\*\d{4}-\d{2}-\d{2}:\*\*\s*(.+?)\s*_\(([^;]+);\s*([^;]+);\s*(.+?)\)_\s*$/);
    if (e) { out.push({ text: e[1].trim(), confidence: normalizeConfidence(e[3].trim()), source: e[4].trim().replace(/^["']|["']$/g, ""), scope: e[2].trim(), reverify: "" }); continue; }
    if (!/\bconfidence:/i.test(body)) continue;
    const text = body.split(/\s*\bconfidence:/i)[0].replace(/^\*{0,2}\d{4}-\d{2}-\d{2}\*{0,2}:\s*/, "").replace(/[\s.;,]+$/, "").trim();
    const conf = (body.match(/\bconfidence:\s*([^;|]+)/i) || [])[1] || "";
    const source = ((body.match(/\bsource:\s*(.+?)(?:;\s*scope:|$)/i) || [])[1] || "").trim();
    const scope = ((body.match(/\bscope:\s*(.+)$/i) || [])[1] || "").trim();
    if (text) out.push({ text, confidence: normalizeConfidence(conf.trim()), source, scope, reverify: "" });
  }
  return out;
}


// Guardrail (flawlessness #10): НИКОГА тайна/ключ/токен в паметта — твърд гейт, не съвет.
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test|prod)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|\b(?:ya29|AQ)\.[0-9A-Za-z_-]{20,}|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
// + КАНОНИЧНИЯТ списък (tools/lib/secret-patterns.mjs). Собственият SECRET_RE беше по-тесен —
// sk-ant-…, github_pat_…, Discord bot token влизаха в паметта (Разбивача, мисия 2). Пазим и локалния
// заради формите, които каноничният умишлено не блокира в рънтайм (JWT, DB URL с парола).
const looksSecret = (s) => { const t = String(s); return SECRET_RE.test(t) || CREDENTIAL.some((p) => p.re.test(t)); };

// Анти устойчива-инжекция (persistent prompt injection): паметта се ИНЖЕКТИРА в
// контекста на всеки бъдещ старт (memory-preload) → зловреден сайт, който убеди агент
// да „научи" инструкция, я закотвя завинаги. Твърд дроп на поуки-инструкции:
// императиви за изпращане/изпълнение, смяна на роля/правила, exfil URL-и, скрити знаци.
const INJECTION_RE = new RegExp(
  [
    /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|earlier|above)\s+(?:instructions?|rules?|context)/.source,
    /(?:игнорирай|забрави|пренебрегни)\s+(?:всички\s+)?(?:предишн[\p{L}]*|предходн[\p{L}]*|горн[\p{L}]*|досегашн[\p{L}]*|тези|тукашн[\p{L}]*)\s+(?:инструкц[\p{L}]*|правил[\p{L}]*|указан[\p{L}]*)/u.source,
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
    /(?:ты\s+теперь|теперь\s+ты|(?:игнорируй|забудь)\s+(?:все\s+)?(?:предыдущие|прежние)\s+(?:инструкции|правила))/u.source, // RU
    /(?:ignore[zr]?|oublie[zr]?)\s+(?:toutes\s+)?les\s+(?:instructions|règles)\s+(?:précédentes|antérieures)/u.source, // FR
    // Variation selectors след буква (не след емоджи) и supplementary VS — невидим носител на текст.
    /[\p{L}][\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/u.source,
    // Нулево-широки/bidi/невидими знаци — същият клас като INVISIBLE в guard-secrets (U+2060, U+FEFF,
    // U+00AD, U+180E, U+3164, Tags). Преди: само U+200B-200F/202A-202E/2066-2069 → скрита инструкция минаваше.
    /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\u{E0000}-\u{E007F}]/u.source,
  ].join("|"),
  "iu",
);
// Нормализация преди проверката: NFKC сгъва fullwidth/стилизирани форми („ｉｇｎｏｒｅ“), а латинизираният
// вариант хваща кирилски хомоглифи в английски фрази („іgnore“ с укр. і). Проверяваме и оригинала
// (невидимите знаци), и двете нормализирани форми.
const HOMOGLYPH = { а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", һ: "h", ԛ: "q", ԝ: "w" };
const latinize = (t) => t.replace(/[аеорсухіјѕԁӏһԛԝ]/g, (c) => HOMOGLYPH[c]);
const looksInjection = (s) => {
  const raw = String(s ?? "");
  const n = raw.normalize("NFKC");
  return INJECTION_RE.test(raw) || INJECTION_RE.test(n) || INJECTION_RE.test(latinize(n.toLowerCase()));
};

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

// Таван за поука (Разбивача: 20 000-знаков булет минаваше и раздуваше паметта). Най-дългата реална
// поука към 2026-09-24 е ~3200 знака с метаданните — таванът е с резерв.
export const MAX_TEXT = 2000, MAX_SOURCE = 600, MAX_LESSONS = 30;

// Бъдеща дата (`date: 2099-…`) изплуваше отровната поука най-отгоре при извличане (сортът е по дата).
// Датата на поуката е най-много днешната; невалидна → днешната.
export function clampDate(raw, today = new Date().toISOString().slice(0, 10)) {
  const d = String(raw || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d))) return today;
  return d > today ? today : d;
}

export function runnerMatches(runner, agent) {
  const r = String(runner || "").trim();
  if (!r) return true;
  return r === agent;
}

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
  // Блокът пише само в паметта на агента, който РЕАЛНО е вървял. Иначе razbivacha (или прочетено
  // съдържание) с `agent: kasadjiyata` тровеше чужда памет (Разбивача, 2026-09-24). Ръчен запис без
  // agent_type (оркестраторът прихваща изгубени поуки) остава възможен.
  if (!runnerMatches(payload.agent_type, parsed.agent)) process.exit(0);

  const date = clampDate(parsed.date);
  const working = readFileSync(file, "utf8");
  // Дедупът вижда И поуките, които чакат в agents/memory — иначе същата поука се публикува повторно.
  const pending = pendingLessons(PROJECT_DIR, parsed.agent, working);
  const seen = lessonIndex(working, pending.length ? `## Проверени поуки\n${pending.join("\n")}\n` : "");

  const newV = [], newQ = [];
  // Таван на броя: един блок не може да наводни паметта (200 поуки = раздута памет + бум на версията).
  for (const les of parsed.lessons.slice(0, MAX_LESSONS)) {
    if (!les.text || !les.source) continue; // източник или нищо
    if (les.text.length > MAX_TEXT || les.source.length > MAX_SOURCE || String(les.scope).length > 200) continue; // таван: паметта не се раздува
    if (looksSecret(les.text) || looksSecret(les.source) || looksSecret(les.scope)) continue; // тайна → НЕ записвай (твърд дроп)
    if (looksInjection(les.text) || looksInjection(les.scope) || looksInjection(les.source)) continue; // анти persistent injection
    // „Verified" иска реален източник; иначе пада в карантина (не вярвай на самооценката).
    let confidence = String(les.confidence || "").toLowerCase();
    if (confidence === "verified" && !sourceIsReal(les.source)) confidence = "unverified";
    const entry = `- **${date}:** ${les.text} _(${les.scope || "общо"}; ${confidence}; ${les.source}${les.reverify ? `; re-verify: ${les.reverify}` : ""})_`;
    // Само точен дубъл или същото тяло. Старата проверка „текстът е подниз на съществуващ ред“
    // изхвърляше истински нови кратки поуки (Разбивача, мисия 2).
    if (seen.has(entry)) continue;
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
