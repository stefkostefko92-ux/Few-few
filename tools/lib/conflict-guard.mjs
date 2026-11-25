// conflict-guard.mjs — предпазител: конфликтни маркери и невалиден JSON НЕ влизат в commit на паметта.
//
// Инцидент (2026-09-25, b82566b3ef; по-рано и d5aeae2a95/029f72e1c4 на 2026-08-05): старата кука за учене
// комитваше в клона на задачата и при отказан push правеше `git pull --rebase --autostash 2>/dev/null` —
// без проверка на изхода и без `git rebase --abort`. Rebase-ът оставаше спрян с маркерите в
// agents-dashboard/agents.json, index.html и паметта; следващото `git add` ги индексира, а git смята
// индексиран файл за решен, дори когато вътре има `<<<<<<<`. Така маркерите стигнаха до main:
// agents.json стана невалиден JSON, oversee/deep-audit/drift-lint паднаха.
//
// Днес публикуването е plumbing (tools/lib/memory-branch.mjs) и само не прави rebase, но всеки commit
// там строи дърво от съдържание, дошло отвън (main, отдалечения agents/memory, работното дърво в
// резервния път). Затова преди ВСЕКИ commit/push: ред, започващ с `<<<<<<< ` или `>>>>>>> `, или `.json`,
// който не се парсва → отказ (fail-closed), с ясна причина. `=======` сам не се брои — среща се в
// легитимен Markdown (setext заглавие), а без двете крайни маркера не е конфликт.
//
// Чиста библиотека: без CLI код на върха (import-safety), без мрежа. git се вика само за четене.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

/** Ред, започващ с маркер на конфликт (с етикет или без). */
export const CONFLICT_LINE = /^(?:<<<<<<<|>>>>>>>)(?: |$)/;
const CONFLICT_LINE_M = new RegExp(CONFLICT_LINE.source, "m");

export class ConflictContentError extends Error {
  constructor(problems) {
    super(`конфликтни маркери/невалиден JSON — commit отказан: ${problems.join("; ")}`);
    this.name = "ConflictContentError";
    this.code = "conflict";
    this.problems = problems;
  }
}

/**
 * Проблемите в едно съдържание: редове с конфликтни маркери + невалиден JSON за `.json`.
 * @returns {string[]} празен масив = чисто
 */
export function contentProblems(path, content) {
  const out = [];
  const s = String(content ?? "");
  if (CONFLICT_LINE_M.test(s)) {
    const lines = s.split("\n");
    const hits = [];
    for (let i = 0; i < lines.length && hits.length < 5; i++) if (CONFLICT_LINE.test(lines[i])) hits.push(i + 1);
    out.push(`${path}:${hits.join(",")} (конфликтен маркер)`);
  }
  if (/\.json$/i.test(path)) {
    try { JSON.parse(s); } catch (e) { out.push(`${path} (невалиден JSON: ${String(e.message).slice(0, 80)})`); }
  }
  return out;
}

/** Проблемите в набор файлове {път: съдържание}. */
export function filesProblems(files) {
  return Object.entries(files || {}).flatMap(([p, c]) => contentProblems(p, c));
}

/** Хвърля ConflictContentError, ако някой файл е замърсен. */
export function assertCleanFiles(files) {
  const p = filesProblems(files);
  if (p.length) throw new ConflictContentError(p);
}

function git(cwd, args, env) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 20000, maxBuffer: 1 << 28, env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout || "", err: r.stderr || "" };
}

/**
 * Проблемите в ДЪРВО (tree/commit), ограничено до `paths`: маркери (един `git grep`, без да чете
 * целия монорепо) + парсване на изброените `.json` от `jsonPaths`. Грешка на git → проблем (fail-closed).
 */
export function treeProblems(cwd, treeish, paths, jsonPaths = []) {
  const out = [];
  const g = git(cwd, ["grep", "-I", "-n", "-E", "-e", "^(<<<<<<<|>>>>>>>)( |$)", treeish, "--", ...paths]);
  if (g.status === 0) {
    const byFile = new Map();
    for (const line of g.out.split("\n").filter(Boolean)) {
      const rest = line.startsWith(`${treeish}:`) ? line.slice(treeish.length + 1) : line;
      const m = rest.match(/^(.*?):(\d+):/);
      if (!m) continue;
      const arr = byFile.get(m[1]) || [];
      if (arr.length < 5) arr.push(m[2]);
      byFile.set(m[1], arr);
    }
    for (const [f, ls] of byFile) out.push(`${f}:${ls.join(",")} (конфликтен маркер)`);
    if (!byFile.size) out.push("git grep намери маркер, но изходът не се разчете");
  } else if (g.status !== 1) {
    out.push(`git grep се провали (${g.status}): ${g.err.trim().slice(0, 120)}`);
  }
  for (const p of jsonPaths) {
    const r = git(cwd, ["cat-file", "-p", `${treeish}:${p}`]);
    if (r.status !== 0) continue; // липсващ файл не е замърсяване
    try { JSON.parse(r.out); } catch (e) { out.push(`${p} (невалиден JSON: ${String(e.message).slice(0, 80)})`); }
  }
  return out;
}

/**
 * Спряна операция в работното дърво (rebase/merge/cherry-pick/revert)? Тогава резервният път НЕ пише
 * в работното дърво — каквото запишем там, следващото `git add -A` на човека го индексира заедно с
 * маркерите. Чуждата операция НЕ се прекратява (`git rebase --abort` би изтрил разрешените конфликти на
 * човека) — куката просто не я докосва.
 */
export function operationInProgress(cwd) {
  const r = git(cwd, ["rev-parse", "--git-dir"]);
  if (r.status !== 0) return null;
  const dir = r.out.trim();
  const abs = isAbsolute(dir) ? dir : join(cwd, dir);
  for (const f of ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    if (existsSync(join(abs, f))) return f;
  }
  return null;
}
