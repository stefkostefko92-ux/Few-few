#!/usr/bin/env node
// tools/social/sedmitsa.mjs — „една идея → седмица постове“ (умението ideya-sedmitsa, собственик Социалджията).
//
// Видеото за фирма без служители (27.11.2026): „една идея става седмица постове във всеки канал“. Нашият
// начин — ЧЕРНОВА, проверена детерминистично, човек одобрява и публикува. Инструментът не говори с мрежа:
// за Instagram с готова медия дава точната команда към тесния piuma.mjs (той създава САМО чернови).
//
// План (JSON):
//   { "idea": "…", "brand": "slug в Piuma", "week": "2026-11-30",
//     "posts": [ { "day": 1..7, "time": "HH:MM", "platform": "instagram|tiktok|youtube|facebook|linkedin|x|threads",
//                  "format": "reels|carousel|image|short|video|text|thread", "hook": "…", "text": "…", "cta": "…",
//                  "hashtags": [], "link": "", "media": "https://…", "alt": "…",
//                  "aiMedia": false, "aiLabel": false, "title": "", "thumbnailText": "" } ] }
//
// Проверките: седмицата (идея, 7 дни, ≥3 канала, различен текст по платформа), постът (hook, CTA, час,
// канал, hook до 120 знака и в началото, етикет за AI медия), твърденията (design-lint → marketing-claims-review)
// и всичко от post-lint (лимити, хаштагове, тайни, alt, UTM, YouTube заглавие/миниатюра).
//
// Употреба:  node tools/social/sedmitsa.mjs check  <план.json>            → изход 1 при HIGH, 2 при липсващ файл
//            node tools/social/sedmitsa.mjs render <план.json> [--out пакет.md] [--captions папка]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain } from "../lib/is-main.mjs";
import { lintPost } from "./post-lint.mjs";
import { lintText } from "../design/design-lint.mjs";

const PLATFORMS = new Set(["instagram", "tiktok", "youtube", "facebook", "linkedin", "x", "threads"]);
const HOOK_MAX = 120;
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const blank = (s) => !String(s || "").trim();

/** Находките за целия план. Чиста функция. */
export function checkWeek(plan) {
  const out = [];
  const add = (sev, code, msg, where = "седмица") => out.push({ sev, code, msg, where });
  const posts = Array.isArray(plan?.posts) ? plan.posts : [];
  if (blank(plan?.idea)) add("HIGH", "no-idea", "Липсва `idea` — седмицата е от ЕДНА идея; без нея е разпилян календар.");
  if (!posts.length) add("HIGH", "no-posts", "Няма постове.");

  const days = new Set();
  const platforms = new Set();
  const byText = new Map();
  posts.forEach((p, i) => {
    const plat = String(p?.platform || "").toLowerCase();
    const where = `ден ${p?.day ?? "?"} · ${plat || "?"}[${i}]`;
    if (!Number.isInteger(p?.day) || p.day < 1 || p.day > 7) add("HIGH", "bad-day", "`day` трябва да е цяло число 1–7.", where);
    else days.add(p.day);
    if (!PLATFORMS.has(plat)) add("HIGH", "bad-platform", `Непознат канал „${plat}“ (${[...PLATFORMS].join(", ")}).`, where);
    else platforms.add(plat);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p?.time || ""))) add("HIGH", "bad-time", "`time` трябва да е ЧЧ:ММ (24 ч, местно време на аудиторията).", where);
    if (blank(p?.hook)) add("HIGH", "no-hook", "Липсва hook — първите 1–3 секунди (първият ред) решават обхвата.", where);
    else {
      if ([...String(p.hook)].length > HOOK_MAX) add("MEDIUM", "hook-too-long", `Hook-ът е над ${HOOK_MAX} знака — на телефона се чете първият ред.`, where);
      if (!norm(p.text).startsWith(norm(p.hook).slice(0, 40))) add("INFO", "hook-not-first", "Текстът не започва с hook-а — първият видим ред е друг.", where);
    }
    if (blank(p?.cta)) add("HIGH", "no-cta", "Липсва CTA — какво да направи човек след поста.", where);
    if (p?.aiMedia && !p?.aiLabel) add("HIGH", "ai-label", "AI генерирана медия без етикет — AI Act чл. 50 и правилата на платформите искат „направено с AI“.", where);
    const key = norm(p?.text);
    if (key) byText.set(key, [...(byText.get(key) || []), plat]);
    // Твърдения: същите правила като в design-lint (claim-needs-proof).
    for (const f of lintText(`<p>${String(p?.text || "").replace(/[<>]/g, " ")}</p>`, "post.html")) {
      if (f.rule === "claim-needs-proof") add("MEDIUM", "claim-needs-proof", `„${f.snippet}“ — твърдение, което иска доказателство; мини го през marketing-claims-review.`, where);
    }
    for (const f of lintPost(p, i)) out.push({ ...f, where });
  });
  for (let d = 1; d <= 7; d++) if (posts.length && !days.has(d)) add("HIGH", "missing-day", `Ден ${d} е празен — седмицата е 7 дни.`);
  if (posts.length && platforms.size < 3) add("MEDIUM", "few-channels", `Каналите са ${platforms.size} — „всеки канал“ значи поне 3.`);
  for (const [, plats] of byText) if (new Set(plats).size > 1) add("MEDIUM", "duplicate-text", `Един и същ текст в ${[...new Set(plats)].join(" и ")} — преработи по платформа (тон, дължина, CTA).`);
  return out;
}

/** Пакетът за копиране: по дни, ЧЕРНОВА. */
export function renderPack(plan) {
  const lines = [
    `# Седмица от една идея: ${plan.idea}`,
    "",
    `> ЧЕРНОВА — публикува човек. Седмица от ${plan.week || "—"}${plan.brand ? ` · бранд ${plan.brand}` : ""}.`,
    "",
  ];
  for (let d = 1; d <= 7; d++) {
    lines.push(`## Ден ${d}`, "");
    const day = (plan.posts || []).filter((p) => p.day === d).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    for (const p of day) {
      lines.push(`### ${p.time} · ${p.platform}${p.format ? ` · ${p.format}` : ""}${p.aiLabel ? " · етикет „AI“" : ""}`, "");
      lines.push(`**Hook:** ${p.hook}`, "", String(p.text || ""), "", `**CTA:** ${p.cta}`);
      if (p.hashtags?.length) lines.push(`**Хаштагове:** ${p.hashtags.join(" ")}`);
      if (p.link) lines.push(`**Връзка:** ${p.link}`);
      if (p.title) lines.push(`**Заглавие:** ${p.title}${p.thumbnailText ? ` · миниатюра: ${p.thumbnailText}` : ""}`);
      if (p.alt) lines.push(`**Alt:** ${p.alt}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Командите към piuma.mjs — само Instagram постове с медия; само `draft` (Piuma не публикува без човек). */
export function piumaCommands(plan, captionsDir) {
  const out = [];
  (plan.posts || []).forEach((p, i) => {
    if (String(p.platform).toLowerCase() !== "instagram" || !/^https:\/\//.test(String(p.media || ""))) return;
    const captionFile = join(captionsDir, `den-${p.day}-${i}.txt`);
    const caption = [p.text, "", p.cta, p.hashtags?.length ? `\n${p.hashtags.join(" ")}` : ""].join("\n").trim();
    const parts = ["node tools/social/piuma.mjs draft", `--brand ${plan.brand}`, `--media ${p.media}`, `--caption-file ${captionFile}`, `--alt ${shellQuote(p.alt || "")}`];
    if (p.format === "reels") parts.push("--kind REELS");
    parts.push(`--topic ${shellQuote(plan.idea)}`);
    out.push({ day: p.day, captionFile, caption, command: parts.join(" ") });
  });
  return out;
}

function main(argv) {
  const [cmd, file] = argv;
  if (!["check", "render"].includes(cmd) || !file) {
    console.error("Употреба: node tools/social/sedmitsa.mjs check|render <план.json> [--out пакет.md] [--captions папка]");
    return 2;
  }
  if (!existsSync(file)) {
    console.error(`Няма такъв файл: ${file}`);
    return 2;
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Планът не е валиден JSON: ${e.message}`);
    return 2;
  }
  const findings = checkWeek(plan);
  const high = findings.filter((f) => f.sev === "HIGH").length;
  if (cmd === "check") {
    for (const f of findings) console.log(`${f.sev.padEnd(6)} ${f.where} · ${f.code} — ${f.msg}`);
    console.log(`sedmitsa: ${findings.length} находки (HIGH ${high})`);
    return high ? 1 : 0;
  }
  if (high) {
    console.error(`Има ${high} HIGH находки — първо „check“, после „render“.`);
    return 1;
  }
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const out = flag("--out") || join(".tmp", "sedmitsa", `${plan.week || "sedmitsa"}.md`);
  mkdirSync(dirname(out), { recursive: true });
  const captions = flag("--captions") || join(dirname(out), "captions");
  const cmds = piumaCommands(plan, captions);
  if (cmds.length) {
    mkdirSync(captions, { recursive: true });
    for (const c of cmds) writeFileSync(c.captionFile, c.caption);
  }
  const pack = renderPack(plan) + (cmds.length ? `\n## Чернови в Piuma (Instagram с медия)\n\n${cmds.map((c) => `- Ден ${c.day}: \`${c.command}\``).join("\n")}\n` : "");
  writeFileSync(out, pack);
  console.log(`✓ пакетът: ${out}${cmds.length ? ` · ${cmds.length} команди за чернови в Piuma` : ""}`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
