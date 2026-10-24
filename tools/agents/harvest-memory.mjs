#!/usr/bin/env node
// harvest-memory.mjs — събира поуките, научени в клонове, които никога не стигнаха до main.
//
// Защо (измерено 2026-09-23): до днес куката комитваше всяка поука в клона на задачата. Нова сесия
// тръгва от main и не вижда нищо, научено другаде → 562 проверени поуки в 32 клона, повечето в отворени
// продуктови PR-и, които може никога да не се слеят. Агентите учеха и после „забравяха".
//
// Какво прави:
//  - за всеки отдалечен клон взема поуките, ДОБАВЕНИ в него спрямо общия предшественик с main (не
//    наследените), които ги няма нито в main, нито в клона на паметта `agents/memory`;
//  - прекарва ги през СЪЩИТЕ филтри като куката и гейтовете: тайна → дроп, инжекция → дроп, повреден
//    запис → дроп; verified без реален източник или с мъртъв път в притежаваната инфра → карантина;
//  - дедуп точен + по тяло, през клоновете (едната поука живее в много клонове с общ произход);
//  - --apply ги публикува в `agents/memory` (tools/lib/memory-branch.mjs) → един PR към main.
//
// Употреба:
//   node tools/agents/harvest-memory.mjs              # доклад (нищо не пише)
//   node tools/agents/harvest-memory.mjs --apply      # публикува в agents/memory и пуска клона
//   node tools/agents/harvest-memory.mjs --check      # СЪВЕТВАЩ гейт: изход 1, ако има заседнали поуки
//   … --no-fetch  (без мрежа)   … --no-push  (само локално)   … --json

import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionLessons, lessonIndex, bodyKey, norm } from "../lib/memory-core.mjs";
import { publishLessons, syncMemoryBranch, LOCAL_REF, REMOTE_REF, MAIN_REF, MEM_PATH } from "../lib/memory-branch.mjs";
import { looksSecret, looksInjection } from "../../.claude/hooks/memory-capture.mjs";
import { findSecret } from "../../.claude/hooks/guard-secrets.mjs";
import { isRealSource, lessonDate } from "./oversee-lib.mjs";
import { malformedLessonField, brokenOwnedMemPaths } from "./deep-audit.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));

function git(cwd, a, timeout = 60000) {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", timeout, maxBuffer: 1 << 28 });
  return { ok: r.status === 0, out: (r.stdout || "").replace(/\n$/, "") };
}
const rev = (cwd, ref) => { const r = git(cwd, ["rev-parse", "-q", "--verify", `${ref}^{commit}`]); return r.ok ? r.out : null; };
const show = (cwd, ref, p) => { const r = git(cwd, ["show", `${ref}:${p}`]); return r.ok ? r.out + "\n" : null; };
const WELL_FORMED = /^- \*\*\d{4}-\d{2}-\d{2}:\*\* \S.* _\(.+\)_$/;

/** Източникът от мета-опашката `_(обхват; увереност; източник…)_`. */
function sourceOf(line) {
  const i = line.lastIndexOf("_(");
  const meta = i === -1 ? "" : line.slice(i + 2, -2);
  const m = meta.match(/;\s*(?:verified|проверено)\s*;\s*(.*)$/i);
  return (m ? m[1] : meta).replace(/;\s*re-verify:.*$/i, "").trim();
}
const demote = (line) => line.replace(/;\s*(verified|проверено)\s*;/i, "; unverified;");

/**
 * Намира заседналите поуки. Чисто четене — нищо не пише.
 * @returns {{branches:number, measured:boolean, perAgent:object, stats:object, byBranch:object, pendingInMemory:number}}
 */
export function harvest(cwd = ROOT, { fetch = true } = {}) {
  if (fetch) git(cwd, ["fetch", "-q", "--prune", "origin"], 180000);
  const main = rev(cwd, MAIN_REF);
  const refs = git(cwd, ["for-each-ref", "--format=%(refname)", "refs/remotes/origin"]).out.split("\n")
    .filter((r) => r && !/\/HEAD$/.test(r) && r !== MAIN_REF && r !== REMOTE_REF);
  const memTip = rev(cwd, LOCAL_REF) || rev(cwd, REMOTE_REF);
  const stats = { candidates: 0, already: 0, curated: 0, inShared: 0, dup: 0, secret: 0, injection: 0, malformed: 0, multiline: 0, unknownAgent: 0, demotedNoSource: 0, demotedDeadPath: 0 };
  const perAgent = {}, byBranch = {};
  if (!main) return { branches: 0, measured: false, perAgent, stats, byBranch, pendingInMemory: 0 };

  const targetIdx = new Map(); // агент → индекс на main + agents/memory
  const target = (agent) => {
    if (!targetIdx.has(agent)) {
      const m = show(cwd, main, `${MEM_PATH}/${agent}.md`);
      targetIdx.set(agent, m == null ? null : lessonIndex(m, memTip ? show(cwd, memTip, `${MEM_PATH}/${agent}.md`) || "" : ""));
    }
    return targetIdx.get(agent);
  };
  const taken = new Set();

  // Била ли е поуката НЯКОГА в main? При squash-merge клонът няма общ предшественик с поуката, затова
  // поука, внесена и после НАРОЧНО махната (курация, сливане на почти-дубли, промоция в _shared), би
  // изглеждала „заседнала" и щеше да се върне. Историята на main е източникът: всеки ред, добавян или
  // махан там (вкл. през merge commit-и спрямо първия родител). Иска пълна история (не плитък clone).
  const everInMain = lessonIndex(git(cwd, ["log", "-p", "--no-renames", "--diff-merges=first-parent", "--format=", main, "--", MEM_PATH]).out
    .split("\n").filter((l) => /^[+-]- \*\*/.test(l)).map((l) => l.slice(1)).join("\n")
    .replace(/^/, "## Проверени поуки\n"));
  const shared = lessonIndex("## Проверени поуки\n" + (show(cwd, main, `${MEM_PATH}/_shared.md`) || "").split("\n").filter((l) => /^- /.test(l)).join("\n"));
  const shallow = git(cwd, ["rev-parse", "--is-shallow-repository"]).out === "true";

  for (const ref of refs) {
    const mb = git(cwd, ["merge-base", main, ref]).out.split("\n")[0];
    if (!mb) continue;
    const changed = git(cwd, ["diff", "--name-only", mb, ref, "--", MEM_PATH]).out.split("\n")
      .filter((p) => /\/[\w-]+\.md$/.test(p) && !/\/(_shared|SECURITY|PROCEDURE|PROTOCOL|README)\.md$/.test(p));
    for (const p of changed) {
      const agent = p.split("/").pop().replace(/\.md$/, "");
      const txt = show(cwd, ref, p);
      if (!txt) continue;
      const was = lessonIndex(show(cwd, mb, p) || "");
      const lines = txt.split("\n");
      for (const which of ["verified", "quarantine"]) {
        for (const line of sectionLessons(txt, which)) {
          if (was.has(line)) continue; // наследена от main, не научена в клона
          stats.candidates++;
          const i = lines.indexOf(line);
          if (i !== -1 && /^[ \t]+\S/.test(lines[i + 1] || "")) { stats.multiline++; continue; } // ръчно засадена — за човек
          const idx = target(agent);
          if (!idx) { stats.unknownAgent++; continue; }
          if (idx.has(line)) { stats.already++; continue; }
          if (everInMain.has(line)) { stats.curated++; continue; } // била в main и махната нарочно
          if (shared.has(line)) { stats.inShared++; continue; }
          const k = norm(line), b = bodyKey(line);
          if (taken.has(k) || taken.has(b)) { stats.dup++; continue; }
          if (!WELL_FORMED.test(line) || malformedLessonField(line)) { stats.malformed++; continue; }
          if (looksSecret(line) || findSecret(line)) { stats.secret++; continue; }
          if (looksInjection(line)) { stats.injection++; continue; }
          // В карантината етикетът „verified" е мъртво знание (deep-audit: buried-lesson) → „unverified".
          let out = which === "quarantine" ? demote(line) : line, sec = which;
          if (which === "verified" && !isRealSource(sourceOf(line))) { out = demote(line); sec = "quarantine"; stats.demotedNoSource++; }
          else if (which === "verified" && brokenOwnedMemPaths(line).length) { out = demote(line); sec = "quarantine"; stats.demotedDeadPath++; }
          taken.add(k); taken.add(b);
          (perAgent[agent] ||= { verified: [], quarantine: [] })[sec].push(out);
          const bn = ref.replace("refs/remotes/origin/", "");
          byBranch[bn] = (byBranch[bn] || 0) + 1;
        }
      }
    }
  }
  // Най-новите първи (редът, в който куката ги пише).
  for (const a of Object.values(perAgent)) for (const k of ["verified", "quarantine"])
    a[k].sort((x, y) => String(lessonDate(y)).localeCompare(String(lessonDate(x))));

  // Колко чакат в agents/memory, но ги няма в main (размерът на неслетия PR на паметта).
  let pendingInMemory = 0;
  if (memTip) for (const f of git(cwd, ["diff", "--name-only", main, memTip, "--", MEM_PATH]).out.split("\n").filter(Boolean)) {
    const mIdx = lessonIndex(show(cwd, main, f) || "");
    pendingInMemory += sectionLessons(show(cwd, memTip, f) || "", "verified").filter((l) => !mIdx.has(l)).length;
  }
  return { branches: refs.length, measured: refs.length > 0 && !shallow, shallow, perAgent, stats, byBranch, pendingInMemory };
}

const count = (perAgent, k) => Object.values(perAgent).reduce((s, a) => s + a[k].length, 0);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = harvest(ROOT, { fetch: !args.has("--no-fetch") });
  const v = count(r.perAgent, "verified"), q = count(r.perAgent, "quarantine");
  if (args.has("--json")) { process.stdout.write(JSON.stringify({ ...r, verified: v, quarantine: q }, null, 2) + "\n"); process.exit(0); }
  if (!r.measured) {
    console.log(`▲ harvest: НЕИЗМЕРЕНО — ${r.shallow ? "плитък clone (пусни git fetch --unshallow origin): без историята на main курираните поуки изглеждат заседнали" : "не виждам отдалечени клонове"}. Празно ≠ чисто.`);
    process.exit(0);
  }
  console.log(`🌾 Заседнали поуки: ${v} проверени + ${q} в карантина, в ${Object.keys(r.byBranch).length} от ${r.branches} клона`);
  const s = r.stats;
  console.log(`   кандидати ${s.candidates} · вече в main/agents/memory ${s.already} · махнати нарочно в main ${s.curated} · вече в _shared ${s.inShared} · дубли между клонове ${s.dup}`);
  console.log(`   отхвърлени: тайна ${s.secret} · инжекция ${s.injection} · повреден запис ${s.malformed} · непознат агент ${s.unknownAgent} · многоредови (за човек) ${s.multiline}`);
  console.log(`   към карантина: без реален източник ${s.demotedNoSource} · мъртъв път в инфрата ${s.demotedDeadPath}`);
  const top = Object.entries(r.perAgent).map(([a, x]) => [a, x.verified.length, x.quarantine.length]).sort((a, b) => b[1] - a[1]);
  for (const [a, vv, qq] of top.slice(0, 12)) console.log(`   ${a.padEnd(22)} ${String(vv).padStart(4)} проверени  ${String(qq).padStart(4)} карантина`);
  console.log(`   чакат в agents/memory, още не в main: ${r.pendingInMemory}`);

  if (args.has("--apply")) {
    if (!v && !q) { console.log("✓ нищо за събиране"); process.exit(0); }
    const branches = Object.keys(r.byBranch).length;
    const pub = publishLessons(ROOT, r.perAgent, { message: `памет: събрани ${v} проверени + ${q} карантина поуки от ${branches} клона (harvest)` });
    if (!pub.ok) { console.error(`✗ публикуване: ${pub.reason}`); process.exit(1); }
    const sy = syncMemoryBranch(ROOT, { push: !args.has("--no-push"), fetch: !args.has("--no-fetch") });
    console.log(`${sy.ok ? "✓" : "✗"} agents/memory ${pub.commit?.slice(0, 8)} · ${sy.steps.join(" · ")}`);
    process.exit(sy.ok ? 0 : 1);
  }
  if (args.has("--check")) {
    if (v) { console.log(`✗ ${v} проверени поуки са заседнали извън main — пусни: node tools/agents/harvest-memory.mjs --apply`); process.exit(1); }
    console.log("✓ нула заседнали проверени поуки");
  }
}
