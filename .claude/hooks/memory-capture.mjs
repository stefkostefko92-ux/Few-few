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

function parseLearn(block) {
  const res = { agent: null, date: null, lessons: [] };
  let cur = null;
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/^\s*agent:\s*(.+)$/))) res.agent = m[1].trim().replace(/^["']|["']$/g, "");
    else if ((m = line.match(/^\s*date:\s*(.+)$/))) res.date = m[1].trim();
    else if ((m = line.match(/^\s*-\s*text:\s*(.+)$/))) { cur = { text: m[1].trim().replace(/^["']|["']$/g, ""), confidence: "unverified", source: "", scope: "" }; res.lessons.push(cur); }
    else if (cur && (m = line.match(/^\s*confidence:\s*(.+)$/))) cur.confidence = m[1].trim().toLowerCase();
    else if (cur && (m = line.match(/^\s*source:\s*(.+)$/))) cur.source = m[1].trim();
    else if (cur && (m = line.match(/^\s*scope:\s*(.+)$/))) cur.scope = m[1].trim();
  }
  return res;
}

const norm = (s) => s.toLowerCase().replace(/[`'"„“”]/g, "").replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();

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

// „Verified" иска РЕАЛЕН източник. Втвърдено: URL трябва да има истински ХОСТ (с точка,
// напр. docs.anthropic.com) — отхвърля малформирани като https://zabobovdol/… (repo-path,
// залепен на https://); ИЛИ реален file:line (път.разширение:ред); ИЛИ познат инструмент/eval.
// Синтактична проверка (не семантична — hook-ът не отваря URL-а); curate + човек до push.
const sourceIsReal = (src) =>
  /https?:\/\/[^/\s]*\.[^/\s.][^/\s]*\//i.test(String(src)) ||           // URL с хост-с-точка + път
  /[\w./-]+\.[a-z]{1,5}:\d+/i.test(String(src)) ||                         // file.ext:line
  /\b(?:eval|test|tool|node|grep|stripe-lint|motion-a11y|check-dups|check-integrity|printability|store-readiness|scan\.sh|busted|luacheck|trivy|axe|lighthouse|EUR-Lex|registry\.npmjs|github\.com|developer\.|caniuse)\b/i.test(String(src));

function ensureSections(txt) {
  if (!/##\s*Проверени поуки/.test(txt)) txt += `\n## Проверени поуки (verified)\n`;
  if (!/##\s*Карантина/.test(txt)) txt += `\n## Карантина (непроверени — НЕ са факт)\n`;
  return txt;
}
function insertUnder(txt, heading, line) {
  const lines = txt.split("\n");
  const idx = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (idx === -1) return txt + `\n${line}\n`;
  lines.splice(idx + 1, 0, line);
  return lines.join("\n");
}
function atomicWrite(file, content) {
  const tmp = `${file}.tmp.${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

// Сериен достъп до таблото — оцелява при паралелни субагенти. mkdir е атомичен.
function withLock(fn) {
  for (let i = 0; i < 150; i++) {
    try { mkdirSync(LOCK_DIR); } catch { sleepMs(40); continue; }
    try { return fn(); } finally { try { rmdirSync(LOCK_DIR); } catch { /* ignore */ } }
  }
  // не успяхме да заключим — пропусни (паметта вече е записана; таблото е козметика)
}
function sleepMs(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

// Без таван на timeline-а: цялата еволюция на ученето се пази (агентите нямат
// лимит на това, което научават — виж bumpVersion + curate MAX_PER_SECTION).
const MAX_EVOLUTION = Infinity;
function cmpVer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
function latestVersion(a) {
  let best = "0.0.0";
  for (const e of a.evolution || []) if (cmpVer(e.version, best) > 0) best = e.version;
  return best;
}
// Схема „учене ролва в major": всеки 10 проверени поуки = +1 major.
// minor е цифра 0–9; 10-ото учене ролва в следващ major (6.9 → 7.0 → …).
// БЕЗ таван — ученето е неограничено: 10.0 → 10.1 → … → 11.0 → … нагоре без край.
// Зрелостта расте вечно, защото знанието на агентите няма лимит.
function bumpVersion(v) {
  const p = String(v).split(".").map((n) => parseInt(n, 10) || 0);
  let maj = p[0] || 0;
  let min = (p[1] || 0) + 1;
  if (min > 9) { maj += 1; min = 0; }
  return `${maj}.${min}.0`;
}

// Прилага activity запис и (при проверено учене) вдига minor версията + timeline запис.
// Връща true, ако нещо се е променило.
function applyUpdate(obj, agentId, activityEntry, evoDetail) {
  const a = (obj.agents || []).find((x) => x.id === agentId);
  if (!a) return false;
  let changed = false;

  a.activity = a.activity || [];
  if (!a.activity.some((x) => x.summary === activityEntry.summary)) {
    a.activity.unshift(activityEntry); // без cap — пазим целия поток на учене
    changed = true;
  }

  // Проверено учене вдига версията (6.1 → 6.2 → …) — ученето „level-up"-ва агента.
  if (evoDetail) {
    a.evolution = a.evolution || [];
    if (!a.evolution.some((e) => e.detail === evoDetail)) {
      const next = bumpVersion(latestVersion(a));
      a.evolution.push({
        version: next,
        date: activityEntry.date,
        event: `v${next.split(".").slice(0, 2).join(".")} — учене`,
        detail: evoDetail,
      });
      // капни timeline-а, но винаги запази „Раждането" (index 0)
      if (a.evolution.length > MAX_EVOLUTION) {
        const birth = a.evolution[0];
        a.evolution = [birth, ...a.evolution.slice(-(MAX_EVOLUTION - 1))];
      }
      changed = true;
    }
  }

  if (obj.meta) obj.meta.updated = activityEntry.date;
  return changed;
}

function updateDashboard(agentId, entry, evoDetail) {
  // 1) agents.json (каноничен)
  if (existsSync(DASH_JSON)) {
    try {
      const j = JSON.parse(readFileSync(DASH_JSON, "utf8"));
      if (applyUpdate(j, agentId, entry, evoDetail)) atomicWrite(DASH_JSON, JSON.stringify(j, null, 2) + "\n");
    } catch { /* ignore */ }
  }
  // 2) вграден FALLBACK в index.html (за file:// преглед)
  if (existsSync(DASH_HTML)) {
    try {
      let h = readFileSync(DASH_HTML, "utf8");
      const s = h.indexOf("const FALLBACK = {");
      if (s === -1) return;
      const b = h.indexOf("{", s);
      // String-aware скоба-матчер: скоби ВЪТРЕ в JSON низове (напр. поука с "{id}")
      // не бива да броят — иначе parse гърми тихо и FALLBACK замръзва (реален бъг).
      let d = 0, i = b, e = -1, inStr = false, esc = false;
      for (; i < h.length; i++) {
        const c = h[i];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') { inStr = true; continue; }
        if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { e = i; break; } }
      }
      if (e === -1) return;
      const fb = JSON.parse(h.slice(b, e + 1));
      if (applyUpdate(fb, agentId, entry, evoDetail)) {
        h = h.slice(0, b) + JSON.stringify(fb, null, 2) + h.slice(e + 1);
        atomicWrite(DASH_HTML, h);
      }
    } catch { /* ignore */ }
  }
}

// Целият git-критичен участък (add + commit + push) под ЕДИН flock — сериализира се между
// ВСИЧКИ паралелни hook-ове. Иначе два detached `git pull --rebase --autostash` се стъпват
// (местят HEAD/индекса едновременно) и губят commit-и — точно бъгът, при който паралелни
// агенти губеха поуки. flock -w 120 ЧАКА реда си (не „пропуска" като mkdir-lock при контенция).
// Detached: не блокира hook-а (SubagentStop има timeout). Push политика: на канона (main/master)
// не пушва сам (влиза през човек/CI/PR — verified-гейтът е синтактичен), освен AGENT_MEMORY_PUSH_MAIN=1.
function bgGitSync(agentId) {
  if (!/^[\w-]+$/.test(agentId)) return; // sanity срещу инжекция в командата
  const lock = join(PROJECT_DIR, "agents-dashboard", ".git-sync.lock");
  const pushMain = process.env.AGENT_MEMORY_PUSH_MAIN === "1" ? "1" : "0";
  const script = [
    `exec 9>"${lock}" 2>/dev/null || exit 0`,
    `flock -w 120 9 || exit 0`,                        // изчакай реда си (до 120с), после се откажи тихо
    `cd "${PROJECT_DIR}" || exit 0`,
    `git add ".claude/agents/_memory/${agentId}.md" "agents-dashboard/agents.json" "agents-dashboard/index.html" 2>/dev/null`,
    `git diff --cached --quiet 2>/dev/null && exit 0`, // нищо staged → нищо за commit
    `git -c user.name="agent-memory" -c user.email="noreply@carbonstealth.eu" commit -m "auto: ${agentId} научи — памет + версия + табло" 2>/dev/null || exit 0`,
    `b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)`,
    `if [ "$b" = "main" ] || [ "$b" = "master" ]; then [ "${pushMain}" = "1" ] || exit 0; fi`,
    `git push 2>/dev/null || (git pull --rebase --autostash 2>/dev/null && git push 2>/dev/null)`,
  ].join("\n");
  try {
    const child = spawn("sh", ["-c", script], { cwd: PROJECT_DIR, detached: true, stdio: "ignore", env: process.env });
    child.unref();
  } catch { /* никога не блокирай агента заради git */ }
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin()); } catch { /* ignore */ }

  // Прекъснат/сринат run → НЕ записвай „научено" (half-baked поука от недовършена мисъл).
  // Fail-open: ако харнесът не подаде такова поле, се държим както преди. (kimi GOAL.md: interrupt≠stop.)
  const stopReason = String(payload.stop_reason || payload.reason || payload.subtype || payload.status || "").toLowerCase();
  if (payload.interrupted === true || payload.is_error === true ||
      /\b(interrupt|cancel|abort|error|fail|timeout|max_turns|max_budget)\b/.test(stopReason)) process.exit(0);

  const tPath = payload.agent_transcript_path || payload.transcript_path || "";
  const text = transcriptText(tPath) || payload.last_assistant_message || "";
  const block = lastLearnBlock(text);
  if (!block) process.exit(0);

  const parsed = parseLearn(block);
  if (!parsed.agent) process.exit(0);
  const file = join(MEM_DIR, `${parsed.agent}.md`);
  if (!existsSync(file)) process.exit(0); // не е от нашия списък — no-op

  const date = parsed.date || new Date().toISOString().slice(0, 10);
  let txt = ensureSections(readFileSync(file, "utf8"));
  const existingNorm = new Set(txt.split("\n").filter((l) => l.startsWith("- ")).map((l) => norm(l)));

  const newVerified = [], newQuar = [];
  for (const les of parsed.lessons) {
    if (!les.text || !les.source) continue; // източник или нищо
    if (looksSecret(les.text) || looksSecret(les.source)) continue; // тайна → НЕ записвай (твърд дроп)
    if (looksInjection(les.text) || looksInjection(les.scope) || looksInjection(les.source)) continue; // инжекция-инструкция → твърд дроп (анти persistent injection)
    // „Verified" иска реален източник; иначе пада в карантина (не вярвай на самооценката).
    let confidence = String(les.confidence || "").toLowerCase();
    if (confidence === "verified" && !sourceIsReal(les.source)) confidence = "unverified";
    const entry = `- **${date}:** ${les.text} _(${les.scope || "общо"}; ${confidence}; ${les.source})_`;
    if (existingNorm.has(norm(entry)) || [...existingNorm].some((e) => e.includes(norm(les.text)))) continue;
    const verified = confidence === "verified";
    txt = insertUnder(txt, verified ? "Проверени поуки" : "Карантина", entry);
    existingNorm.add(norm(entry));
    (verified ? newVerified : newQuar).push(les.text);
  }

  if (newVerified.length + newQuar.length === 0) process.exit(0);
  atomicWrite(file, txt);

  // обнови таблото (activity feed) — страницата „живее" при всяко научено нещо
  const trim = (s) => (s.length > 90 ? s.slice(0, 87) + "…" : s);
  let summary;
  if (newVerified.length) {
    summary = `Научи: „${trim(newVerified[0])}"` +
      (newVerified.length > 1 ? ` (+${newVerified.length - 1} още)` : "") +
      (newQuar.length ? ` · ${newQuar.length} в карантина` : "");
  } else {
    summary = `Хипотеза → карантина: „${trim(newQuar[0])}"` + (newQuar.length > 1 ? ` (+${newQuar.length - 1})` : "");
  }
  const activity = { date, type: newVerified.length ? "learning" : "quarantine", summary };
  // Само ПРОВЕРЕНО учене вдига версията (карантина не брои).
  const evoDetail = newVerified.length
    ? `Научи: ${trim(newVerified[0])}${newVerified.length > 1 ? ` (+${newVerified.length - 1} още)` : ""}`
    : null;
  // Таблото (локален JSON запис) под mkdir-lock; целият git участък (add+commit+push) отива
  // в ЕДИН flock-guarded detached процес → сериализиран между всички паралелни агенти, без загуба.
  withLock(() => { updateDashboard(parsed.agent, activity, evoDetail); });
  bgGitSync(parsed.agent);

  process.exit(0);
}

try { main(); } catch { process.exit(0); } // никога не блокирай агента заради паметта
