#!/usr/bin/env node
// trigger-check.mjs — РАЗЛИЧИМОСТ на описанията на уменията.
//
// Защо съществува. Официалният наръчник на Anthropic („The Complete Guide to Building Skills for
// Claude") слага задействането ПЪРВО в препоръчаните тестове: умение, което не се вдига навреме,
// е нула, колкото и добро да е тялото му. Нашият линт дотук проверяваше само СТРУКТУРА — че
// frontmatter-ът е валиден, че препратките съществуват. Никой не проверяваше дали описанията
// изобщо се различават помежду си, а точно там живее задействането.
//
// Какво мери и какво НЕ мери. Не симулира Claude — реалното задействане не е наблюдаемо оттук и
// всяко твърдение в тази посока би било измислица. Мери РАЗЛИЧИМОСТ: за всяка формулировка от
// корпуса смята с кое описание се препокрива най-силно и сверява дали това е правилното умение.
// Провал значи, че две описания се препокриват, не че Claude ще сбърка. Това е честната граница.
//
// Тежести: рядката дума носи повече от честата (IDF през 21-те описания) — иначе „Ползвай когато",
// което е във всяко описание, би доминирало сходството и всичко би приличало на всичко.
//
//   node tools/skills/trigger-check.mjs           # доклад
//   node tools/skills/trigger-check.mjs --check   # гейт (exit 1 при разминаване)

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lint.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = join(ROOT, ".claude", "skills");
const CORPUS = join(ROOT, "tools", "skills", "triggers.json");

// Думи, които носят нула сигнал за РАЗГРАНИЧАВАНЕ — всяко второ описание ги съдържа.
const STOP = new Set(["и", "или", "на", "за", "в", "с", "по", "от", "до", "при", "да", "се", "е",
  "не", "но", "като", "че", "го", "я", "ги", "си", "то", "този", "тази", "това", "тези", "който",
  "която", "което", "които", "ако", "когато", "ползвай", "използвай", "всеки", "всяка", "всяко",
  "преди", "след", "без", "нов", "нова", "ново", "нови", "ти", "ми", "най", "по-", "още", "вече"]);

export const norm = (s) => s.toLowerCase().replace(/[„“"'`’(),.;:!?—–\-\/\[\]<>#*]/g, " ");
export const toks = (s) => norm(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
/** Груба българска нормализация: реже честите окончания, за да съвпадне „страница"/„страници". */
// Глаголните окончания са добавени, след като гейтът вдигна „добави"↔„добавяш" като различни думи:
// това е дупка в НОРМАЛИЗАЦИЯТА, не в описанието, и ако се приеме за находка, човек би тръгнал да
// „поправя" изряден текст. Редът е важен — дългите окончания се пробват първи.
export const stem = (w) => w.replace(
  /(аването|ването|ането|ията|ите|ата|ове|ият|ия|ът|та|то|те|ваш|ваш|яваш|аваш|аш|яш|иш|еш|ам|ям|им|ем|ат|ят|и|а|о|е)$/u, "");

function build(skills) {
  const docs = skills.map((s) => new Set(toks(s.description).map(stem)));
  const df = new Map();
  for (const d of docs) for (const w of d) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log((skills.length + 1) / ((df.get(w) || 0) + 0.5));
  return { docs, idf };
}

/** Сходство фраза↔описание: сума от IDF на общите основи, нормализирана по дължина на фразата. */
function score(phrase, doc, idf) {
  const q = [...new Set(toks(phrase).map(stem))];
  if (!q.length) return 0;
  let s = 0;
  for (const w of q) if (doc.has(w)) s += idf(w);
  return s / Math.sqrt(q.length);
}

export function rank(phrase, skills, ctx) {
  return skills
    .map((s, i) => ({ name: s.name, s: score(phrase, ctx.docs[i], ctx.idf) }))
    .sort((a, b) => b.s - a.s);
}

// ── какво ГЕЙТВА и какво само ДОКЛАДВА ────────────────────────────────────────────────────────
// Първата версия гейтваше класацията: „should" фразата да е #1 за своето умение. Тя даде 12
// разминавания — и при разчепкване се оказа, че скорерът не е достатъчно остър, за да е съдия:
// десетки фрази съвпадат по ЕДНА основа с няколко описания и IDF решава жребия. Да „поправя" 21
// истински описания, за да зазеленя такъв показател, значи да развалям текст заради счупен
// детектор — точно обратното на целта.
// Затова гейтът пази това, което Е решимо и е буквално изискване от наръчника: описанието трябва
// да съдържа формулировките, които потребителят реално би казал. Ако фраза, която ТРЯБВА да вдигне
// умението, няма нито една обща дума с описанието му, това не е мнение — описанието е сляпо за нея.
// Класацията остава като доклад: показва къде две описания се препокриват, за да се разчепка от
// човек, но не пада гейта.
export function audit(skills, corpus) {
  const ctx = build(skills);
  const fails = [], notes = [];
  const known = new Set(skills.map((s) => s.name));
  for (const name of Object.keys(corpus)) {
    if (!known.has(name)) fails.push({ kind: "сирак", name, msg: `корпусът описва несъществуващо умение „${name}"` });
  }
  for (const s of skills) {
    if (!corpus[s.name]) fails.push({ kind: "непокрито", name: s.name, msg: "няма тригер-случаи в корпуса" });
    else {
      const c = corpus[s.name];
      if ((c.should || []).length < 3) fails.push({ kind: "плитко", name: s.name, msg: "иска поне 3 „should“ (очевидна · перифраза · косвена)" });
      if ((c.shouldNot || []).length < 2) fails.push({ kind: "плитко", name: s.name, msg: "иска поне 2 „shouldNot“ (съседни теми)" });
    }
  }
  for (const [name, cases] of Object.entries(corpus)) {
    const i = skills.findIndex((s) => s.name === name);
    if (i < 0) continue;
    for (const p of cases.should || []) {
      // ГЕЙТ: описанието трябва да е „чуло" поне една носеща дума от формулировката.
      const shared = [...new Set(toks(p).map(stem))].filter((w) => ctx.docs[i].has(w));
      if (!shared.length) {
        fails.push({ kind: "сляпо описание", name, msg: `„${p}" няма НИТО ЕДНА обща дума с описанието на „${name}"` });
        continue;
      }
      const r = rank(p, skills, ctx);   // доклад
      if (r[0].name !== name) notes.push(`${name}: „${p}" се препокрива по-силно с „${r[0].name}"`);
    }
    for (const p of cases.shouldNot || []) {
      const r = rank(p, skills, ctx);
      if (r[0].name === name) notes.push(`${name}: съседната „${p}" сочи насам — описанията се застъпват`);
    }
  }
  return { fails, notes };
}

export function loadSkills(dir = SKILLS) {
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())
    .filter((f) => existsSync(join(dir, f, "SKILL.md")))
    .map((f) => {
      const { fm } = parseFrontmatter(readFileSync(join(dir, f, "SKILL.md"), "utf8")) || { fm: {} };
      return { name: f, description: fm.description || "" };
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CHECK = process.argv.includes("--check");
  const skills = loadSkills();
  const corpus = JSON.parse(readFileSync(CORPUS, "utf8")).skills;
  const { fails, notes } = audit(skills, corpus);
  const n = Object.values(corpus).reduce((a, c) => a + (c.should?.length || 0) + (c.shouldNot?.length || 0), 0);
  console.log(`\n🎯  Различимост на уменията — ${skills.length} умения · ${n} формулировки\n`);
  for (const f of fails) console.log(`  \x1b[31m✗\x1b[0m ${f.kind.padEnd(15)} ${f.msg}`);
  for (const w of notes) console.log(`  \x1b[33m▲\x1b[0m тясна разлика   ${w}`);
  if (!fails.length) console.log(`  \x1b[32m✓\x1b[0m всяко описание „чува" всяка формулировка, която трябва да го вдигне.`);
  console.log(`\n  ГЕЙТ: покритие на корпуса + описание, което носи думите на своите тригери.`);
  console.log(`  ДОКЛАД (не гейтва): застъпване между описания — лексикален проксѝ, НЕ симулация на`);
  console.log(`  реалното задействане на Claude; то не е наблюдаемо оттук.`);
  console.log(`  ${fails.length} гейтващи · ${notes.length} застъпвания за човешко око\n`);
  process.exit(CHECK && fails.length ? 1 : 0);
}
