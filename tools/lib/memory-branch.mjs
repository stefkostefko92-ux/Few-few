#!/usr/bin/env node
// memory-branch.mjs — ученето на агентите живее в СОБСТВЕН клон (`agents/memory`), не в клона на задачата.
//
// Защо (измерено 2026-09-23): куката комитваше всяка поука в клона, на който работи сесията. Нова
// сесия тръгва от `main` и чете паметта от своя checkout → не вижда нищо, научено другаде. 562
// проверени поуки стояха в 32 клона и никога не стигнаха до main; осем от девет проверени клона
// не се сливаха чисто — основно заради паметта и таблото, които всяка поука пипаше.
//
// Как:
//  1. publishLessons — поуката става commit в `refs/heads/agents/memory` през git plumbing
//     (временен индекс, hash-object, commit-tree). HEAD, индексът и работното дърво на човека НЕ се
//     пипат — затова отворен merge/rebase или чуждо стажирано съдържание не могат да бъдат погълнати
//     (дефектът от 2026-09-21 изчезва като КЛАС, не като частен случай).
//  2. syncMemoryBranch — (фоново) fetch; ако отдалеченият клон се е разклонил → обединяващ commit;
//     ако `main` е напреднал → „сгъване" на main в клона (дървото на main + добавените поуки +
//     пресметнато табло). Така PR-ът agents/memory → main винаги е без конфликти и се слива бързо.
//  3. pendingLessons — memory-preload добавя поуките от клона, които ги няма в текущия checkout,
//     значи следващият агент (в тази или в нова сесия) ги вижда още преди PR-а да е слят.
// Обединяването е по СЪДЪРЖАНИЕ (редове поуки), не с git merge машинария — нула конфликтни маркери.
//
// CLI:  node tools/lib/memory-branch.mjs --sync [--no-push] [--no-fetch]

import { spawnSync } from "node:child_process";
import { mkdirSync, rmdirSync, statSync, rmSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { addLessons, sectionLessons, countVerifiedText, lessonIndex, lessonText, summarize, applyUpdate, norm, bodyKey } from "./memory-core.mjs";
import { parseFallback, replaceFallback } from "./dashboard-fallback.mjs";

export const MEMORY_BRANCH = "agents/memory";
export const LOCAL_REF = `refs/heads/${MEMORY_BRANCH}`;
export const REMOTE_REF = `refs/remotes/origin/${MEMORY_BRANCH}`;
export const MAIN_REF = "refs/remotes/origin/main";
export const MEM_PATH = ".claude/agents/_memory";
const DASH_JSON = "agents-dashboard/agents.json";
// Append-only дневници, които пътуват с клона на паметта (реалната употреба на токени). При обединяване
// и сгъване на main се пазят РЕДОВЕТЕ от двете страни — иначе сгъването би изтрило телеметрията.
export const APPEND_ONLY = ["tools/agents/evals/usage.jsonl"];
const PENDING_USAGE = "agents-usage.pending.jsonl"; // в .git — локално, не се комитва
const DASH_HTML = "agents-dashboard/index.html";
const AGENT_FILE = /^[\w-]+\.md$/;
const NOT_AGENT = /^(_shared|SECURITY|PROCEDURE|PROTOCOL|README)\.md$/;
const IDENTITY = { GIT_AUTHOR_NAME: "Claude", GIT_AUTHOR_EMAIL: "noreply@anthropic.com", GIT_COMMITTER_NAME: "Claude", GIT_COMMITTER_EMAIL: "noreply@anthropic.com" };

function git(cwd, args, { input, env, timeout = 20000, raw = false } = {}) {
  const r = spawnSync("git", args, { cwd, input, encoding: "utf8", timeout, maxBuffer: 1 << 28, env: { ...process.env, ...env } });
  return { ok: r.status === 0, out: raw ? (r.stdout || "") : (r.stdout || "").replace(/\n$/, ""), err: r.stderr || "" };
}
const rev = (cwd, ref) => { const r = git(cwd, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]); return r.ok ? r.out : null; };
const isAncestor = (cwd, a, b) => git(cwd, ["merge-base", "--is-ancestor", a, b]).ok;
const mergeBase = (cwd, a, b) => { const r = git(cwd, ["merge-base", a, b]); return r.ok ? r.out.split("\n")[0] : null; };
// Байт-за-байт (raw): файл без завършващ нов ред не бива да получава такъв — иначе всеки commit
// „променя" последния ред (хванато от гейта върху printadjiyata.md при първото събиране).
const show = (cwd, ref, path) => { if (!ref) return null; const r = git(cwd, ["show", `${ref}:${path}`], { raw: true }); return r.ok ? r.out : null; };
const agentFiles = (cwd, ref) => {
  const r = git(cwd, ["ls-tree", "--name-only", `${ref}:${MEM_PATH}`]);
  return r.ok ? r.out.split("\n").filter((f) => AGENT_FILE.test(f) && !NOT_AGENT.test(f)) : [];
};
export const isGitRepo = (cwd) => git(cwd, ["rev-parse", "--git-dir"]).ok;
const gitPath = (cwd, p) => { const r = git(cwd, ["rev-parse", "--git-path", p]); return r.ok ? (isAbsolute(r.out) ? r.out : join(cwd, r.out)) : null; };

// ─── заключване (mkdir е атомичен; застоял лок > 2 мин се чисти) ──────────────────────────────
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
export function withRepoLock(cwd, fn, { waitMs = 15000 } = {}) {
  const lock = gitPath(cwd, "agents-memory.lock");
  if (!lock) return fn();
  const until = Date.now() + waitMs;
  for (;;) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 120000) { rmdirSync(lock); continue; } } catch { /* изчезнал — пробвай пак */ }
      if (Date.now() > until) throw new Error("agents-memory.lock: зает");
      sleepMs(50);
    }
  }
  try { return fn(); } finally { try { rmdirSync(lock); } catch { /* ignore */ } }
}

/** Commit с дадени файлове върху дървото на `baseCommit` — БЕЗ да пипа HEAD, индекса или работното дърво. */
function commitFiles(cwd, baseCommit, files, parents, message) {
  const idx = gitPath(cwd, `agents-memory-index-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: idx, ...IDENTITY };
  try {
    if (!git(cwd, ["read-tree", baseCommit], { env }).ok) throw new Error("read-tree");
    for (const [path, content] of Object.entries(files)) {
      const blob = git(cwd, ["hash-object", "-w", "--stdin"], { input: content, env });
      if (!blob.ok) throw new Error("hash-object " + path);
      if (!git(cwd, ["update-index", "--add", "--cacheinfo", `100644,${blob.out},${path}`], { env }).ok) throw new Error("update-index " + path);
    }
    const tree = git(cwd, ["write-tree"], { env });
    if (!tree.ok) throw new Error("write-tree");
    const c = git(cwd, ["commit-tree", tree.out, ...parents.flatMap((p) => ["-p", p]), "-m", message], { env });
    if (!c.ok) throw new Error("commit-tree");
    return c.out;
  } finally { try { rmSync(idx, { force: true }); } catch { /* ignore */ } }
}

/** Таблото (agents.json + FALLBACK) с приложено учене за всеки агент. Връща файлове за commit-а. */
function dashboardFiles(cwd, baseCommit, updates) {
  const files = {};
  const json = show(cwd, baseCommit, DASH_JSON);
  if (json) {
    try {
      const obj = JSON.parse(json);
      let ch = false;
      for (const u of updates) ch = applyUpdate(obj, u.agent, u.activity, u.evoDetail, u.verifiedCount, u.lessons) || ch;
      if (ch) files[DASH_JSON] = JSON.stringify(obj, null, 2) + "\n";
    } catch { /* повредено табло → паметта пак се записва */ }
  }
  const html = show(cwd, baseCommit, DASH_HTML);
  if (html) {
    try {
      const fb = parseFallback(html);
      if (fb) {
        let ch = false;
        for (const u of updates) ch = applyUpdate(fb, u.agent, u.activity, u.evoDetail, u.verifiedCount, u.lessons) || ch;
        if (ch) files[DASH_HTML] = replaceFallback(html, fb);
      }
    } catch { /* ignore */ }
  }
  return files;
}

/**
 * Прилага поуки върху дървото на `baseCommit`: памет (без дубли) + табло. Не създава commit.
 * @param {Record<string,{verified?:string[],quarantine?:string[]}>} perAgent
 */
function applyLessons(cwd, baseCommit, perAgent, date) {
  const files = {}, updates = [], added = {}, skipped = [];
  for (const [agent, lessons] of Object.entries(perAgent)) {
    const path = `${MEM_PATH}/${agent}.md`;
    const cur = show(cwd, baseCommit, path);
    if (cur == null) { skipped.push(agent); continue; } // агент, който основата не познава (нов в клон) → повикващият решава
    const r = addLessons(cur, lessons);
    added[agent] = r.added;
    if (!r.added.verified.length && !r.added.quarantine.length) continue;
    files[path] = r.txt;
    const s = summarize(r.added.verified.map(lessonText), r.added.quarantine.map(lessonText), date);
    updates.push({ agent, ...s, lessons: countVerifiedText(r.txt) });
  }
  Object.assign(files, dashboardFiles(cwd, baseCommit, updates));
  return { files, added, skipped, changed: updates.length > 0 };
}

/** Върхът, върху който се публикува: локалният клон на паметта, отдалеченият, или main. */
function publishBase(cwd) {
  const local = rev(cwd, LOCAL_REF), remote = rev(cwd, REMOTE_REF);
  if (local && remote) return isAncestor(cwd, local, remote) ? remote : local; // разклонени → локалният; sync ги обединява
  return local || remote || rev(cwd, MAIN_REF) || rev(cwd, "HEAD");
}

/**
 * Публикува поуки в `agents/memory` (локално, синхронно). Никога не пипа HEAD/индекс/работно дърво.
 * @returns {{ok:boolean, commit?:string, added?:object, skipped?:string[], reason?:string}}
 */
export function publishLessons(cwd, perAgent, { date = new Date().toISOString().slice(0, 10), message } = {}) {
  if (!isGitRepo(cwd)) return { ok: false, reason: "не е git репо" };
  return withRepoLock(cwd, () => {
    const base = publishBase(cwd);
    if (!base) return { ok: false, reason: "няма основа (нито agents/memory, нито main)" };
    const { files, added, skipped, changed } = applyLessons(cwd, base, perAgent, date);
    if (!changed) return { ok: true, commit: base, added, skipped, unchanged: true };
    const agents = Object.keys(added).filter((a) => added[a].verified.length + added[a].quarantine.length);
    const msg = message || `auto: ${agents.join(", ")} научи — памет + версия + табло`;
    const commit = commitFiles(cwd, base, files, [base], msg);
    const old = rev(cwd, LOCAL_REF);
    if (!git(cwd, ["update-ref", LOCAL_REF, commit, ...(old ? [old] : [])]).ok) return { ok: false, reason: "update-ref" };
    return { ok: true, commit, added, skipped };
  });
}

/** Поуките (по раздели), добавени в `tip` спрямо `since`, за всеки агент. */
function addedSince(cwd, tip, since) {
  const out = {};
  for (const f of agentFiles(cwd, tip)) {
    const path = `${MEM_PATH}/${f}`;
    const t = show(cwd, tip, path) || "";
    const idx = lessonIndex(since ? show(cwd, since, path) || "" : "");
    const v = sectionLessons(t, "verified").filter((l) => !idx.has(l));
    const q = sectionLessons(t, "quarantine").filter((l) => !idx.has(l));
    if (v.length || q.length) out[f.replace(/\.md$/, "")] = { verified: v, quarantine: q };
  }
  return out;
}

/** Редовете на append-only файловете от `other`, които ги няма в `base` → файлове за commit върху base. */
function appendOnlyUnion(cwd, base, other) {
  const files = {};
  for (const path of APPEND_ONLY) {
    const b = show(cwd, base, path) || "", o = show(cwd, other, path) || "";
    const have = new Set(b.split("\n").filter(Boolean));
    const add = o.split("\n").filter((l) => l && !have.has(l));
    if (add.length) files[path] = (b && !b.endsWith("\n") ? b + "\n" : b) + add.join("\n") + "\n";
  }
  return files;
}

/** Обединява `other` в `base` по съдържание: дървото на base + поуките, които other е добавил след общия им предшественик. */
function unionCommit(cwd, base, other, message, date) {
  const since = mergeBase(cwd, base, other);
  const lessons = addedSince(cwd, other, since);
  const { files } = applyLessons(cwd, base, lessons, date);
  Object.assign(files, appendOnlyUnion(cwd, base, other));
  return commitFiles(cwd, base, files, [other, base], message);
}

/** Локален буфер за записи за употреба (в .git — не цапа клона на задачата). */
export function pendingUsagePath(cwd) { return gitPath(cwd, PENDING_USAGE); }
export function appendPendingUsage(cwd, rec) {
  const p = pendingUsagePath(cwd); if (!p || !rec) return false;
  try { appendFileSync(p, JSON.stringify(rec) + "\n"); return true; } catch { return false; }
}

/**
 * Изпраща натрупаните записи за употреба в `agents/memory` като ЕДИН commit (append-only дневник).
 * Не пипа HEAD/индекс/работно дърво. Буферът се чисти само след успешен commit.
 */
export function flushUsage(cwd, { message } = {}) {
  if (!isGitRepo(cwd)) return { ok: false, reason: "не е git репо" };
  const p = pendingUsagePath(cwd);
  if (!p || !existsSync(p)) return { ok: true, flushed: 0 };
  return withRepoLock(cwd, () => {
    let pending = "";
    try { pending = readFileSync(p, "utf8"); } catch { return { ok: true, flushed: 0 }; }
    const lines = pending.split("\n").filter(Boolean);
    if (!lines.length) { try { rmSync(p, { force: true }); } catch { /* ignore */ } return { ok: true, flushed: 0 }; }
    const base = publishBase(cwd);
    if (!base) return { ok: false, reason: "няма основа" };
    const cur = show(cwd, base, APPEND_ONLY[0]) || "";
    const ver = (l) => { try { const r = JSON.parse(l); return r && r.id ? { id: r.id, v: Number(r.v) || 1 } : null; } catch { return null; } };
    const have = new Map();
    for (const l of cur.split("\n").filter(Boolean)) { const m = ver(l); if (m) have.set(m.id, Math.max(have.get(m.id) || 0, m.v)); }
    // Агент, върнат от DoD гейта, спира втори път — ПОСЛЕДНИЯТ запис за същото пускане е пълният.
    const last = new Map();
    for (const l of lines) { const m = ver(l); if (m) last.set(m.id, l); }
    // Нов id → добавя се; същият id с по-висока версия (backfill) → добавя се поправен ред, четецът взима по-високата v.
    const add = [...last].filter(([id, l]) => !have.has(id) || ver(l).v > have.get(id)).map(([, l]) => l);
    if (!add.length) { rmSync(p, { force: true }); return { ok: true, flushed: 0 }; }
    const content = (cur && !cur.endsWith("\n") ? cur + "\n" : cur) + add.join("\n") + "\n";
    const commit = commitFiles(cwd, base, { [APPEND_ONLY[0]]: content }, [base], message || `памет: употреба на ${add.length} пускания на агенти`);
    const old = rev(cwd, LOCAL_REF);
    if (!git(cwd, ["update-ref", LOCAL_REF, commit, ...(old ? [old] : [])]).ok) return { ok: false, reason: "update-ref" };
    rmSync(p, { force: true });
    return { ok: true, flushed: add.length, commit };
  });
}

/**
 * Синхронизира клона на паметта: fetch → обединяване с отдалечения → сгъване на main → push.
 * @returns {{ok:boolean, tip?:string, pushed?:boolean, steps:string[]}}
 */
export function syncMemoryBranch(cwd, { fetch = true, push = true, date = new Date().toISOString().slice(0, 10) } = {}) {
  const steps = [];
  if (!isGitRepo(cwd)) return { ok: false, steps: ["не е git репо"] };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (fetch) {
      git(cwd, ["fetch", "-q", "origin", "+refs/heads/main:" + MAIN_REF], { timeout: 60000 });
      git(cwd, ["fetch", "-q", "origin", `+${LOCAL_REF}:${REMOTE_REF}`], { timeout: 60000 }); // може да липсва — не е грешка
    }
    const tip = withRepoLock(cwd, () => {
      let local = rev(cwd, LOCAL_REF);
      const remote = rev(cwd, REMOTE_REF), main = rev(cwd, MAIN_REF);
      let t = local || remote;
      if (local && remote && !isAncestor(cwd, remote, local)) {
        if (isAncestor(cwd, local, remote)) t = remote;
        else { t = unionCommit(cwd, remote, local, "памет: обединяване на agents/memory (локален ↔ отдалечен)", date); steps.push("обединен с отдалечения"); }
      }
      if (main && t && isAncestor(cwd, t, main)) { t = main; steps.push("догонен main (PR-ът е слят)"); }
      else if (main && t && !isAncestor(cwd, main, t)) {
        t = unionCommit(cwd, main, t, "памет: сгъване на main в agents/memory", date);
        steps.push("сгънат main");
      }
      if (!t) return null;
      if (t !== local) git(cwd, ["update-ref", LOCAL_REF, t, ...(local ? [local] : [])]);
      return t;
    });
    if (!tip) return { ok: true, steps: [...steps, "няма клон на паметта"] };
    if (!push) return { ok: true, tip, pushed: false, steps };
    if (rev(cwd, REMOTE_REF) === tip) return { ok: true, tip, pushed: false, steps: [...steps, "вече е актуален"] };
    const p = git(cwd, ["push", "-q", "origin", `${tip}:${LOCAL_REF}`], { timeout: 60000 });
    if (p.ok) { git(cwd, ["update-ref", REMOTE_REF, tip]); return { ok: true, tip, pushed: true, steps: [...steps, "пуснат"] }; }
    steps.push(`push отказан (опит ${attempt + 1}) — нов fetch и обединяване`);
    if (!fetch) break;
  }
  return { ok: false, steps };
}

/**
 * Проверени поуки от клона на паметта, които ги НЯМА в текущия checkout (`workingTxt`) и не са били в
 * общия предшественик с HEAD (т.е. не са махнати нарочно при курация). Най-новите първи. Никога не хвърля.
 */
export function pendingLessons(cwd, agentId, workingTxt) {
  try {
    if (!/^[\w-]+$/.test(agentId) || !isGitRepo(cwd)) return [];
    const path = `${MEM_PATH}/${agentId}.md`;
    const have = lessonIndex(workingTxt || "");
    const out = [];
    const seen = new Set();
    for (const ref of [LOCAL_REF, REMOTE_REF]) {
      const tip = rev(cwd, ref);
      if (!tip || seen.has(tip)) continue;
      seen.add(tip);
      const mb = mergeBase(cwd, tip, "HEAD");
      const was = lessonIndex(mb ? show(cwd, mb, path) || "" : "");
      for (const l of sectionLessons(show(cwd, tip, path) || "", "verified")) {
        if (have.has(l) || was.has(l)) continue;
        have.exact.add(norm(l)); have.bodies.add(bodyKey(l));
        out.push(l);
      }
    }
    return out;
  } catch { return []; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || join(fileURLToPath(import.meta.url), "..", "..", "..");
  if (process.argv.includes("--sync")) {
    let r;
    if (process.argv.includes("--flush-usage")) { try { flushUsage(cwd); } catch { /* употребата е измерване — никога не спира синхронизацията */ } }
    try { r = syncMemoryBranch(cwd, { push: !process.argv.includes("--no-push"), fetch: !process.argv.includes("--no-fetch") }); }
    catch (e) { r = { ok: false, steps: [String(e.message || e)] }; }
    process.stdout.write(`${r.ok ? "✓" : "✗"} agents/memory: ${r.steps.join(" · ") || "без промяна"}${r.tip ? ` (${r.tip.slice(0, 8)})` : ""}\n`);
    process.exit(r.ok ? 0 : 1);
  }
  process.stdout.write("употреба: node tools/lib/memory-branch.mjs --sync [--no-push] [--no-fetch]\n");
}
