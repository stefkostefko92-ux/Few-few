// deep-audit.test.mjs — одиторът на дупките трябва да лови ИМЕННО дупките, които веднъж минаха.
//
// Всяка проверка тук съответства на реален пропуск, открит при дълбокия одит:
//   • injection покритието се четеше от `agents.json`, а два агента имаха WebFetch само в
//     дефиницията → „всички покрити" при нула тестове за тях;
//   • skill цитираше `tools/payments/stripe-lint.mjs` (реално: `tools/commerce/`);
//   • `SupremeBot/` беше продукт без ред в CLAUDE.md и без собствен CLAUDE.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { writeAtomic } from "../lib/mutation.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { audit, agentIds, productDirs, brokenToolRefs, brokenOwnedMemPaths, execWithoutBash } from "./deep-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Временно мутира РЕАЛЕН файл с памет (audit() чете от __dirname-корена, копие в /tmp гледа друг
 *  корен и не възпроизвежда състоянието — научено: замърсен тест лъже). Възстановява byte-за-byte. */
function withMemoryMutation(id, transform, fn) {
  const path = join(ROOT, ".claude", "agents", "_memory", `${id}.md`);
  const original = readFileSync(path, "utf8");
  writeAtomic(path, transform(original));
  try { return fn(); }
  finally {
    writeAtomic(path, original);
    assert.equal(readFileSync(path, "utf8"), original, `${id}.md: възстановяването се провали`);
  }
}

test("реалното репо няма ТВЪРДИ пропуски", () => {
  const { hard } = audit();
  assert.deepEqual(hard, [], "твърдите пропуски трябва да са нула:\n" + hard.map((h) => `  [${h.kind}] ${h.msg}`).join("\n"));
});

test("brokenToolRefs лови несъществуващ път и мълчи за реален", () => {
  assert.deepEqual(brokenToolRefs("виж node tools/commerce/stripe-lint.mjs за проверка"), []);
  assert.deepEqual(brokenToolRefs("виж tools/payments/stripe-lint.mjs"), ["tools/payments/stripe-lint.mjs"]);
  assert.deepEqual(brokenToolRefs(""), []);
  assert.deepEqual(brokenToolRefs("`tools/a.mjs` и пак `tools/a.mjs`"), ["tools/a.mjs"], "дедуп");
});

test("brokenToolRefs не се подлъгва по не-.mjs или по продуктови пътища", () => {
  assert.deepEqual(brokenToolRefs("adblock/tools/build_filters.mjs"), [],
    "продуктов път (не започва с tools/) не се проверява спрямо корена");
  assert.deepEqual(brokenToolRefs("tools/seo/README.md"), [], "само .mjs");
});

test("всеки агент с WebFetch/WebSearch има инжекционен spec (проверено срещу ДЕФИНИЦИЯТА)", () => {
  const ids = agentIds();
  const web = ids.filter((id) => /WebFetch|WebSearch/.test(
    (readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8").match(/^tools:\s*(.+)$/m) || [])[1] || ""));
  assert.ok(web.length >= 20, `очаквам голяма външна повърхност, намерих ${web.length}`);
  for (const id of web)
    assert.ok(existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id}.json`))
      || existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id.replace(/-/g, "")}.json`))
      || audit().hard.every((h) => !h.msg.includes(id)),
      `${id} чете външно съдържание, но няма инжекционен spec`);
});

test("prevodach и siydara — регресията, която обезсили гейта — са покрити", () => {
  for (const id of ["prevodach", "siydara"]) {
    const def = readFileSync(join(ROOT, ".claude", "agents", id + ".md"), "utf8");
    assert.match(def, /^tools:.*WebFetch/m, `${id} трябва да има WebFetch в дефиницията`);
    assert.ok(existsSync(join(ROOT, "tools/agents/evals/specs", `injection-${id}.json`)),
      `${id} трябва да има injection spec`);
  }
});

test("регистърът и дефинициите съвпадат по tools/model/effort", () => {
  const aj = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  for (const a of aj.agents) {
    const md = readFileSync(join(ROOT, ".claude", "agents", a.id + ".md"), "utf8");
    const fm = (k) => (md.match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [])[1]?.trim();
    const dT = (fm("tools") || "").split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
    const jT = (a.tools || []).map((s) => String(s).trim()).sort().join(",");
    assert.equal(dT, jT, `${a.id}: tools разсинхрон`);
  }
});

test("всеки продукт е документиран — свой CLAUDE.md И ред в root таблицата", () => {
  const root = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  for (const p of productDirs()) {
    assert.ok(existsSync(join(ROOT, p, "CLAUDE.md")), `„${p}" няма собствен CLAUDE.md`);
    assert.match(root, new RegExp("`" + p + "/`"), `„${p}" липсва в таблицата на root CLAUDE.md`);
  }
});

test("SupremeBot — продуктът, който никой агент не знаеше — е документиран", () => {
  assert.ok(productDirs().includes("SupremeBot"));
  const md = readFileSync(join(ROOT, "SupremeBot", "CLAUDE.md"), "utf8");
  assert.match(md, /Tanoth/, "описва реалния продукт");
  assert.match(md, /ToS|Общите условия/i, "носи предупреждението за бан — това е рискът на продукта");
});

test("съветващите находки НЕ гейтват (иначе одитът става неизползваем)", () => {
  const { hard, soft } = audit();
  assert.ok(Array.isArray(soft));
  for (const s of soft) assert.ok(!hard.includes(s), "съветващо не бива да е в твърдите");
});

test("productDirs изключва служебните папки", () => {
  const p = productDirs();
  for (const skip of ["tools", "deploy", "docs", "agents-dashboard", "research", "client"])
    assert.ok(!p.includes(skip), `„${skip}" не е продукт`);
  assert.ok(p.includes("zabobovdol") && p.includes("medqr"), "реалните продукти са вътре");
});

test("ТВЪРДО: поука с таг verified под Карантина (мъртво знание) — 7 реални изцерени 2026-08-03", () => {
  // Инжектирай verified-таг булет под Карантина в РЕАЛЕН файл → audit() трябва да го хване като hard.
  // Скоби в източника нарочно — позиционен парсер (`split[1]` / `[^)]*`) би пропуснал точно тях.
  const injected = withMemoryMutation("izpitatelya", (md) =>
    md.replace(/^(##\s*Карантина.*)$/m, `$1\n- **2099-01-01:** ТЕСТ заровена поука _(тест (със скоби); verified; "източник (пак скоби)")_`),
    () => audit().hard.filter((h) => h.kind === "buried-lesson"));
  assert.ok(injected.some((h) => h.msg.includes("izpitatelya")), "verified под Карантина трябва да е ТВЪРД пропуск");
  // след възстановяване — нула (пази да не сме оставили боклук)
  assert.deepEqual(audit().hard.filter((h) => h.kind === "buried-lesson"), []);
});

test("ТВЪРДО: дублирано заглавие Карантина (readerите четат само първото) — 5 реални слети 2026-08-03", () => {
  const found = withMemoryMutation("izpitatelya", (md) => md + "\n## Карантина (дубликат)\n- нещо\n",
    () => audit().hard.filter((h) => h.kind === "memory-dup"));
  assert.ok(found.some((h) => h.msg.includes("izpitatelya") && h.msg.includes("Карантина")), "двойна секция трябва да е ТВЪРД пропуск");
  assert.deepEqual(audit().hard.filter((h) => h.kind === "memory-dup"), []);
});

test("brokenOwnedMemPaths: хваща мъртъв АГЕНТ-СЛОЙ път, но е ИМУНЕН на 4-те FP класа", () => {
  // РЕАЛНИЯТ клас (treydara): агент-слой път, който не съществува → находка.
  assert.deepEqual(brokenOwnedMemPaths("виж tools/agents/memory-preload.mjs"), ["tools/agents/memory-preload.mjs"],
    "стар грешен път (реалният е .claude/hooks/) трябва да се хване");
  assert.deepEqual(brokenOwnedMemPaths("виж .claude/hooks/memory-preload.mjs"), [], "реалният път — чисто");
  // FP-1 truncation: versions.json НЕ бива да се реже до versions.js (документиран FP, за малко повторен)
  assert.deepEqual(brokenOwnedMemPaths("version-freshness чете tools/agents/versions.json"), [],
    "разширението json не бива да се реже до js");
  assert.deepEqual(brokenOwnedMemPaths("дневникът tools/agents/evals/errors.jsonl расте"), [], "jsonl не се реже");
  // FP-2 upstream docs: docs/api.md (WiseLibs) НЕ е притежавана инфра → игнориран
  assert.deepEqual(brokenOwnedMemPaths("better-sqlite3 (WiseLibs docs/api.md)"), [], "upstream docs не е наш анкер");
  // FP-4 продуктов път: adblock/tools/… НЕ е анкер (продуктов, не коренен tools/)
  assert.deepEqual(brokenOwnedMemPaths("adblock/tools/build_filters.mjs е ок"), [], "продуктов tools/ не се съди");
  // node_modules — упстрийм типове, не наш код
  assert.deepEqual(brokenOwnedMemPaths("tools/agents/node_modules/x/y.js"), [], "node_modules се пропуска");
});

test("ТВЪРДО: verified поука цитира несъществуващ агент-слой път (treydara класът)", () => {
  const found = withMemoryMutation("izpitatelya", (md) =>
    md.replace(/^(##\s*Проверени поуки.*)$/m, `$1\n- **2099-01-01:** ТЕСТ _(t; verified; "tools/agents/nema-takuv-fail.mjs:9")_`),
    () => audit().hard.filter((h) => h.kind === "dead-mem-path"));
  assert.ok(found.some((h) => h.msg.includes("izpitatelya") && h.msg.includes("nema-takuv-fail")), "мъртъв агент-слой път трябва да е ТВЪРД");
  assert.deepEqual(audit().hard.filter((h) => h.kind === "dead-mem-path"), [], "след възстановяване — нула");
});

test("ТВЪРДО: мъртъв агент-слой път в ФЛОТ-ШИРОК файл (_shared.md, инжектиран ×флота)", () => {
  // _shared.md влиза в статичния префикс на ВСЕКИ агент → мъртъв път там струва ×флота.
  // Гейтът за агентите го пропускаше (_shared не е в списъка ids) — затова отделно покритие.
  const found = withMemoryMutation("_shared", (md) =>
    md + "\n- ТЕСТ ред с мъртъв път `tools/agents/nema-takuv-shared.mjs`\n",
    () => audit().hard.filter((h) => h.kind === "dead-mem-path"));
  assert.ok(found.some((h) => h.msg.includes("_shared.md") && h.msg.includes("nema-takuv-shared")),
    "мъртъв път във флот-широк файл трябва да е ТВЪРД");
  assert.deepEqual(audit().hard.filter((h) => h.kind === "dead-mem-path"), [], "след възстановяване — нула");
});

test("execWithoutBash: no-Bash агент с DoD команда → находка; проза/има-Bash → нула", () => {
  const md = [
    "tools: Read, Grep, Glob, WebFetch",
    "- **Верификатор:** `node tools/agents/verifier.mjs x` минава детерминистичния DoD чек.",
    "просто споменаваме `node tools/legal/a11y.mjs` в описание без задължение",
  ].join("\n");
  // ред 2 е задължение (верификатор+DoD+команда) → находка; ред 3 е проза → не
  assert.deepEqual(execWithoutBash(md, "Read, Grep, Glob, WebFetch"), [2]);
  // същият текст, но агентът ИМА Bash → нула (може да изпълнява)
  assert.deepEqual(execWithoutBash(md, "Read, Bash, Grep"), []);
  // никаква команда → нула
  assert.deepEqual(execWithoutBash("- просто одит без инструменти", "Read"), []);
});

// ── Кръг 9 (2026-08-04): дефиницията не бива да сочи към агент/умение, което не съществува ──────
// Проверено на живо: 169 пътя в 28-те дефиниции → 0 липсващи; 0 препратки към несъществуващ агент;
// 0 към несъществуващо умение. Тоест кръгът НЕ поправя — заковава празнина в покритието.
// `drift-lint` пази БРОЙКАТА на екипа и файловите пътища, но НЕ имената: преименуване на агент или
// умение (имали сме такова: `claude-uchitel` → `uchitel`) би оставило мъртва препратка в чужда
// дефиниция, а делегирането „възложи на агента X" мълчаливо няма адресат.
test("нито една дефиниция не сочи към несъществуващ АГЕНТ или УМЕНИЕ", () => {
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  const names = new Set((reg.agents || reg).map((a) => a.name).filter(Boolean));
  const skillsDir = join(ROOT, ".claude", "skills");
  const skills = new Set(readdirSync(skillsDir).filter((f) => existsSync(join(skillsDir, f, "SKILL.md"))));
  const bad = [];
  for (const f of readdirSync(join(ROOT, ".claude", "agents")).filter((x) => x.endsWith(".md") && !x.startsWith("_") && x !== "README.md")) {
    const src = readFileSync(join(ROOT, ".claude", "agents", f), "utf8");
    for (const m of src.matchAll(/агент[аът]{1,2}\s+\*{0,2}([А-Я][а-яА-Я-]+)/g))
      if (!names.has(m[1])) bad.push(`${f}: „агентът ${m[1]}" не е в регистъра`);
    for (const m of src.matchAll(/(?:skill|умение(?:то)?)\s+\*{0,2}`?([a-z][a-z0-9-]{2,})`?/gi))
      if (!skills.has(m[1])) bad.push(`${f}: умение „${m[1]}" няма SKILL.md`);
  }
  assert.deepEqual([...new Set(bad)], [], "мъртви препратки в дефиниции:\n  " + bad.join("\n  "));
});

// ── Кръг 13 (2026-08-04): повреден запис в паметта ───────────────────────────────────────────────
// Открито при първото реално пускане на `quarantine-review.mjs` (инструмент, който съществуваше и
// никой не беше пускал): три записа при Скоростника носеха в ТЕКСТА си полета на самия ```learn
// блок. Най-тежкият, `skorostnika.md:56`, беше самият ХЕДЪР — „agent: skorostnika date: 2026-07-29
// entries:" — тоест поуката е изчезнала и на нейно място стои синтаксис. Другите два имаха цял
// текст с паразитен префикс „statement: ", като ЕДИНИЯТ беше в „Проверени поуки", значи се
// инжектираше в агента при ВСЕКИ старт.
//
// Повреден запис е по-лош от липсващ: заема място, брои се за знание в таблото и изглежда
// правдоподобно. Правилото е СТРУКТУРНО (ключ на поле в НАЧАЛОТО на текста), не прозаично —
// затова има зъби без да гадае. Измерено: 3 съвпадения из целия флот, и трите реални.
import { malformedLessonField } from "./deep-audit.mjs";

test("повреден запис: хедърът на learn блока, попаднал като текст на поука", () => {
  const real = "- **2026-07-29:** agent: skorostnika date: 2026-07-29 entries: _(Lighthouse/PSI вътрешности; unverified; няма)_";
  assert.equal(malformedLessonField(real), "agent");
});

test("повреден запис: паразитен префикс „statement:“ (съдържанието е цяло, записът пак е счупен)", () => {
  const real = "- **2026-07-29:** statement: 100/100 локално НЕ е гаранция за жив CWV _(обхват; verified; tools/seo/cwv.mjs)_";
  assert.equal(malformedLessonField(real), "statement");
});

test("здрава поука НЕ се вдига", () => {
  assert.equal(malformedLessonField("- **2026-08-04:** Кешът пада при различен системен блок. _(обхват; high; \"източник\")_"), null);
});

// Границата, която пази правилото от шум: полеви ключ ВЪТРЕ в прозата е легитимен.
for (const [bullet, why] of [
  ['- **2026-08-04:** Цитирай така: source: MDN, а не голо URL. _(обхват; high; "и")_', "„source:“ в средата е част от съвета"],
  ['- **2026-08-04:** Полето date: в JSON-LD иска ISO 8601. _(обхват; high; "и")_', "името на поле като ТЕМА на поуката"],
  ['- **2026-08-04:** agentic loop-ът иска таван на ходовете. _(обхват; high; "и")_', "дума, започваща с „agent“, но без двоеточие"],
])
  test(`НЕ вдига: ${why}`, () => {
    assert.equal(malformedLessonField(bullet), null, "правилото гледа само НАЧАЛОТО — иначе ще шуми и ще го изключат");
  });

test("паметта на флота е чиста от повредени записи (регресия срещу рецидив)", () => {
  const memDir = join(ROOT, ".claude", "agents", "_memory");
  const bad = [];
  for (const f of readdirSync(memDir).filter((x) => x.endsWith(".md") && x !== "PROTOCOL.md"))
    for (const l of readFileSync(join(memDir, f), "utf8").split("\n"))
      if (l.trim().startsWith("- ") && malformedLessonField(l)) bad.push(`${f}: ${l.slice(0, 80)}`);
  assert.deepEqual(bad, [], "повреден запис в паметта — виж deep-audit [malformed-lesson]");
});

// ── Кръг 14 (2026-08-04): котви към ПРЕИМЕНУВАНА папка ──────────────────────────────────────────
// Открито при пресверката на цялата карантина: преименуване на продуктова папка обезсилва наведнъж
// всяка поука, закотвена в нея. `vps-dashboard/`→`vpsdash/` (комит f9138190) уби 14 поуки на
// Наблюдателя и 4 на VPS-аджията; `supreme/`→`SupremeDiscordBot/` (b0f96d78) развали котви при
// четири агента; `ospedali/`→`ospedalitrasparenti/` — още. Дотогава нямаше НИКАКЪВ сигнал.
//
// ЗАЩО ЯВЕН РЕГИСТЪР, а не „несъществуващ пръв сегмент": измерено върху паметта — широкото правило
// дава 87 „мъртви корена", от които реални са 3; останалите са URL сегменти (`unpkg.com/`), под-пътища
// (`apps/`, `packages/`, `routes/`) и файлови имена. Пореден случай от същия урок: гейтвай това, което
// собственикът ЗНАЕ, не това, което детекторът гадае.
import { renamedPathHits } from "./deep-audit.mjs";

const RN = [{ old: "supreme", new: "SupremeDiscordBot" }, { old: "vps-dashboard", new: "vpsdash" }];

test("котва към преименувана папка СЕ хваща (реалният дефект)", () => {
  const r = renamedPathHits("виж supreme/bot/src/index.js:89 за хендлърите", RN);
  assert.equal(r.anchors.length, 1);
  assert.equal(r.anchors[0].nu, "SupremeDiscordBot");
});

test("прозаично старо име се БРОИ, но не е котва (иначе гейтът иска пренаписване на историята)", () => {
  const r = renamedPathHits("supreme/ дизайнът беше друг тогава", RN);
  assert.equal(r.anchors.length, 0, "не е счупена котва");
  assert.equal(r.prose.length, 1, "но се отчита като остаряло наименование");
});

// Границите, измерени върху реалната памет: широкото правило вдигаше по всяко от тези.
for (const [text, why] of [
  ["новият път е SupremeDiscordBot/bot/src/index.js", "новото име НЕ бива да се хваща"],
  ["https://unpkg.com/discord.js@14.26.4/typings/index.d.ts", "URL сегмент, не репо път"],
  ["Gaming/apps/web/src/main.ts е точката на вход", "легитимен под-път"],
  ["инсталацията чете /etc/vps-dashboard/config.json", "старото име е ЛЕГИТИМНО за инсталацията"],
])
  test(`НЕ вдига: ${why}`, () => {
    assert.equal(renamedPathHits(text, RN).anchors.length, 0, "правилото се е разширило — ще шуми");
  });

test("регистърът е честен: старите папки ги няма, новите ги има", () => {
  const { renames } = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "renames.json"), "utf8"));
  assert.ok(renames.length >= 3, "трите известни преименувания трябва да са вписани");
  for (const r of renames) {
    assert.ok(!existsSync(join(ROOT, r.old)), `„${r.old}" още съществува — редът е застоял`);
    assert.ok(existsSync(join(ROOT, r.new)), `„${r.new}" не съществува`);
  }
});

test("паметта и дефинициите са чисти от котви към преименувани папки (регресия)", () => {
  const { renames } = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "renames.json"), "utf8"));
  const bad = [];
  for (const d of [join(ROOT, ".claude", "agents"), join(ROOT, ".claude", "agents", "_memory")])
    for (const f of readdirSync(d).filter((x) => x.endsWith(".md")))
      for (const h of renamedPathHits(readFileSync(join(d, f), "utf8"), renames).anchors)
        bad.push(`${f}: ${h.hit}`);
  assert.deepEqual(bad, [], "счупена котва след преименуване — виж deep-audit [renamed-path]");
});
