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
import { execSync, spawn } from "node:child_process";

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
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test|prod)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const looksSecret = (s) => SECRET_RE.test(String(s));

// „Verified" иска РЕАЛЕН източник (URL / file:line / познат инструмент/eval); иначе → карантина.
const sourceIsReal = (src) =>
  /https?:\/\/\S+|[\w./-]+\.\w+:\d+|\b(?:eval|test|tool|node|grep|stripe-lint|motion-a11y|check-dups|check-integrity|printability|store-readiness|scan\.sh|busted|luacheck|trivy|axe|lighthouse|EUR-Lex|docs\.|registry\.npmjs|github\.com|developer\.|caniuse)\b/i.test(String(src));

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
  for (let i = 0; i < 50; i++) {
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

// Авто-commit (само паметта на агента + таблото) — локално и бързо. Без помитане на чужди промени.
function gitCommitLocal(agentId) {
  if (!/^[\w-]+$/.test(agentId)) return; // sanity срещу инжекция в командата
  try {
    execSync(`git add ".claude/agents/_memory/${agentId}.md" "agents-dashboard/agents.json" "agents-dashboard/index.html"`,
      { cwd: PROJECT_DIR, stdio: "ignore", timeout: 10000 });
    try { execSync("git diff --cached --quiet", { cwd: PROJECT_DIR, stdio: "ignore" }); return; } // нищо staged → нищо за commit
    catch { /* има staged промени → commit */ }
    execSync(`git -c user.name="agent-memory" -c user.email="noreply@carbonstealth.eu" commit -m "auto: ${agentId} научи — памет + версия + табло"`,
      { cwd: PROJECT_DIR, stdio: "ignore", timeout: 10000 });
  } catch { /* никога не блокирай агента заради git */ }
}

// Push във ФОН (detached) — не блокира hook-а; при non-fast-forward прави rebase и пробва пак.
function bgPush() {
  try {
    const child = spawn("sh", ["-c", "git push 2>/dev/null || (git pull --rebase --autostash 2>/dev/null && git push 2>/dev/null)"],
      { cwd: PROJECT_DIR, detached: true, stdio: "ignore" });
    child.unref();
  } catch { /* ignore */ }
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin()); } catch { /* ignore */ }

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
  // Таблото + локален commit под един lock (бързи, локални операции); push-ът е във фон.
  withLock(() => {
    updateDashboard(parsed.agent, activity, evoDetail);
    gitCommitLocal(parsed.agent);
  });
  bgPush();

  process.exit(0);
}

try { main(); } catch { process.exit(0); } // никога не блокирай агента заради паметта
