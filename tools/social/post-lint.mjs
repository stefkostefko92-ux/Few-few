#!/usr/bin/env node
// tools/social/post-lint.mjs — линтер за социални постове (Социалджията).
//
// Проверява JSON план за постове (или .md с front-matter-подобни полета) БЕЗ да ги публикува:
// дължина по платформа, липсващ alt текст (достъпност), UTM на връзките (аналитика), твърде много
// хаштагове, тайна/PII в текста, споменаване без явен guard. Целта е грешки да не стигат до платформа.
//
// Формат (JSON): { "posts": [ { "platform": "x|instagram|linkedin|facebook|threads|tiktok|youtube",
//                               "text": "...", "link": "https://…", "alt": "…", "hashtags": ["…"],
//                               "title": "…", "thumbnailText": "…" } ] }   // title/thumbnailText — YouTube
//
// Заглавие и миниатюра като двойка (23.11.2026, идея от youtube-agent-skill, наш код): двете се виждат заедно —
// миниатюрата трябва да ДОБАВЯ към заглавието, не да го повтаря; заглавието се реже в търсенето след ~70 знака.
//
// Употреба:  node tools/social/post-lint.mjs <файл.json|папка>
// Изход: 0 = чисто/само INFO, 1 = има HIGH находки.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { isMain } from "../lib/is-main.mjs";

// Лимити на дължина (символи) по платформа — консервативни, публично известни.
const LIMIT = { x: 280, twitter: 280, threads: 500, mastodon: 500, instagram: 2200, tiktok: 2200, facebook: 63206, linkedin: 3000, youtube: 5000 };
// YouTube: заглавие до 100 знака (твърд лимит), описание до 5000; в търсенето заглавието се вижда ~70 знака.
const TITLE_MAX = 100, TITLE_VISIBLE = 70, THUMB_WORDS = 5;
const TITLED = new Set(["youtube"]);
// Съдържателни думи за сравнение: малки букви, без пунктуация, поне 3 знака или число.
const contentWords = (s) => new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((w) => w.length >= 3 || /\d/.test(w)));
const MAX_HASHTAGS = { x: 3, twitter: 3, threads: 5, instagram: 30, tiktok: 8, facebook: 5, linkedin: 5, mastodon: 5 };
// Груби сигнали за тайна/PII в публичен текст.
const SECRET_RE = /(sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN)/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// Оценява един пост. Чиста функция — тестваема.
export function lintPost(post, idx) {
  const out = [];
  const at = post.platform ? `${post.platform}[${idx}]` : `post[${idx}]`;
  const add = (sev, code, msg) => out.push({ sev, code, msg, where: at });
  const text = String(post.text || "");
  const plat = String(post.platform || "").toLowerCase();

  if (!plat) add("MEDIUM", "no-platform", "Липсва `platform` — не мога да проверя лимити/хаштагове за поста.");
  if (!text.trim()) { add("HIGH", "empty-text", "Празен `text` — няма какво да се публикува."); return out; }

  // Дължина по платформа
  const limit = LIMIT[plat];
  if (limit && text.length > limit) add("HIGH", "too-long", `Текстът е ${text.length} символа > лимита ${limit} за „${plat}" — ще се отреже/отхвърли.`);

  // Тайна/PII в публичен текст
  if (SECRET_RE.test(text)) add("HIGH", "secret-in-text", "Изглежда тайна (API ключ/Bearer/PEM) в публичен пост — премахни веднага; ако е реална → ротирай.");
  if (EMAIL_RE.test(text) && !/contact|контакт|info@|hello@|support@/i.test(text)) add("INFO", "email-in-text", "Личен имейл в публичен текст — увери се, че е нарочен (GDPR минимизация).");

  // Alt текст за достъпност, ако има медия
  if ((post.media || post.image || post.hasMedia) && !String(post.alt || "").trim())
    add("MEDIUM", "no-alt", "Пост с медия без `alt` текст — недостъпен за екранни четци (EAA/WCAG). Добави описателен alt.");

  // UTM на връзка (иначе трафикът не се приписва)
  if (post.link && /^https?:\/\//.test(post.link) && !/[?&]utm_source=/.test(post.link))
    add("INFO", "no-utm", "Връзката няма `utm_source` — трафикът от този пост няма да се проследи в аналитиката. Добави UTM.");

  // Заглавие + миниатюра (YouTube): лимит, видимост в търсенето, двойката да не се повтаря.
  if (TITLED.has(plat)) {
    const title = String(post.title || "").trim();
    const thumb = String(post.thumbnailText || "").trim();
    if ([...title].length > TITLE_MAX) add("HIGH", "title-too-long", `Заглавието е ${[...title].length} знака > ${TITLE_MAX} — YouTube не го приема.`);
    else if ([...title].length > TITLE_VISIBLE) add("INFO", "title-truncated", `Заглавието е ${[...title].length} знака — в търсенето се вижда ~${TITLE_VISIBLE}; ключовото сложи отпред.`);
    if (title && !thumb) add("INFO", "no-thumb-pair", "Има заглавие, но няма `thumbnailText` — проверката на двойката заглавие/миниатюра не може да мине.");
    if (thumb) {
      const n = thumb.split(/\s+/).filter(Boolean).length;
      if (n > THUMB_WORDS) add("INFO", "thumb-too-wordy", `Текстът на миниатюрата е ${n} думи — на телефон се чете до ~${THUMB_WORDS} (евристика).`);
      const tw = contentWords(thumb), hw = contentWords(title);
      const shared = [...tw].filter((w) => hw.has(w) || [...hw].some((h) => h.length >= 5 && w.length >= 5 && (h.startsWith(w.slice(0, 5)) || w.startsWith(h.slice(0, 5)))));
      if (tw.size && shared.length / tw.size >= 0.6) add("MEDIUM", "thumb-repeats-title", `Миниатюрата повтаря заглавието (${shared.join(", ")}) — двете се виждат заедно; миниатюрата да добавя (обещание, емоция, контраст), не да повтаря.`);
    }
  }

  // Прекалено много хаштагове
  const tags = Array.isArray(post.hashtags) ? post.hashtags : (text.match(/#[\p{L}0-9_]+/gu) || []);
  const maxTags = MAX_HASHTAGS[plat];
  if (maxTags && tags.length > maxTags) add("INFO", "too-many-hashtags", `${tags.length} хаштага > препоръчаните ${maxTags} за „${plat}" — изглежда спам, реч намалява.`);

  return out;
}

// Разбор на входа: JSON с { posts:[…] } или единичен пост.
export function lintSource(src, rel) {
  let data;
  try { data = JSON.parse(src); } catch (e) { return [{ sev: "HIGH", code: "bad-json", msg: `Невалиден JSON: ${e.message}`, where: rel }]; }
  const posts = Array.isArray(data) ? data : Array.isArray(data.posts) ? data.posts : [data];
  const out = [];
  posts.forEach((p, i) => lintPost(p, i).forEach((f) => out.push({ ...f, where: `${rel} · ${f.where}` })));
  return out;
}

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build"].includes(e)) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

function report(findings, root) {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ post-lint: чисто (няма находки)."); return; }
  console.log(`post-lint — ${findings.length} находки за ${root}:\n`);
  for (const f of findings) console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}

function runCli() {
  const root = process.argv[2] || ".";
  if (!existsSync(root)) { report([{ sev: "HIGH", code: "no-path", msg: `Пътят не съществува: ${root}`, where: root }], root); process.exit(1); }
  const files = (statSync(root).isDirectory() ? walk(root) : [root]).filter((f) => extname(f) === ".json");
  const findings = [];
  for (const f of files) {
    let src = ""; try { src = readFileSync(f, "utf8"); } catch { continue; }
    if (!/"posts"|"platform"|"text"/.test(src)) continue; // само файлове, които изглеждат като план за постове
    findings.push(...lintSource(src, f.replace(root, "").replace(/^\//, "") || f));
  }
  report(findings, root);
  process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);
}

if (isMain(import.meta.url)) runCli();
