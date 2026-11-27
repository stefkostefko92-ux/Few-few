// sedmitsa.test.mjs — „една идея → седмица постове“ (умението ideya-sedmitsa, собственик Социалджията).
//
// Видеото за фирма без служители (27.11): „една идея става седмица постове във всеки канал“. Нашият начин:
// планът е ЧЕРНОВА — проверява се детерминистично (тук), човек одобрява, публикува човек. Инструментът
// не говори с мрежа; за Instagram с готова медия дава точната команда към тесния piuma.mjs (само чернова).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWeek, renderPack, piumaCommands } from "./sedmitsa.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const post = (day, platform, extra = {}) => ({
  day,
  time: "18:30",
  platform,
  format: "short",
  hook: `Ден ${day}: една грешка струва клиент`,
  text: `Ден ${day}: една грешка струва клиент. Ето как да я избегнеш с Linketto — без комисиони, на 27 езика (${platform}).`,
  cta: "Пробвай безплатно",
  hashtags: ["#linkinbio"],
  ...extra,
});
const PLATS = ["instagram", "tiktok", "linkedin", "facebook", "youtube", "x", "instagram"];
const good = () => ({
  idea: "Линк в био без комисиони",
  brand: "linketto",
  week: "2026-11-30",
  posts: PLATS.map((p, i) => post(i + 1, p, p === "youtube" ? { title: "Линк в био без комисиони", thumbnailText: "0% такси" } : {})),
});
const codes = (plan) => checkWeek(plan).map((f) => `${f.sev}:${f.code}`);
const high = (plan) => checkWeek(plan).filter((f) => f.sev === "HIGH").map((f) => f.code);

test("добрата седмица: 7 дни, 6 канала, hook и CTA навсякъде — нула HIGH", () => {
  assert.deepEqual(high(good()), []);
});

test("липсваща идея, празен ден и ден извън 1–7 са HIGH", () => {
  const p = good();
  delete p.idea;
  p.posts = p.posts.filter((x) => x.day !== 4);
  p.posts.push(post(9, "x"));
  const h = high(p);
  assert.ok(h.includes("no-idea"));
  assert.ok(h.includes("missing-day"), "ден 4 липсва");
  assert.ok(h.includes("bad-day"), "ден 9");
});

test("пост без hook или CTA, с грешен час или непознат канал е HIGH", () => {
  const p = good();
  p.posts[0].hook = "";
  p.posts[1].cta = " ";
  p.posts[2].time = "25:00";
  p.posts[3].platform = "myspace";
  const h = high(p);
  for (const c of ["no-hook", "no-cta", "bad-time", "bad-platform"]) assert.ok(h.includes(c), c);
});

test("под 3 канала — MEDIUM; един и същ текст в два канала — MEDIUM (преработи по платформа)", () => {
  const p = good();
  p.posts = p.posts.map((x, i) => ({ ...x, platform: i % 2 ? "instagram" : "tiktok" }));
  p.posts[1].text = p.posts[0].text;
  const c = codes(p);
  assert.ok(c.includes("MEDIUM:few-channels"));
  assert.ok(c.includes("MEDIUM:duplicate-text"));
});

test("дълъг hook — MEDIUM; текстът не започва с hook-а — INFO", () => {
  const p = good();
  p.posts[0].hook = "а".repeat(130);
  p.posts[1].text = "Нещо друго първо. " + p.posts[1].text;
  const c = codes(p);
  assert.ok(c.includes("MEDIUM:hook-too-long"));
  assert.ok(c.includes("INFO:hook-not-first"));
});

test("AI медия без етикет е HIGH (AI Act чл. 50 + правилата на платформите)", () => {
  const p = good();
  p.posts[0].aiMedia = true;
  assert.ok(high(p).includes("ai-label"));
  p.posts[0].aiLabel = true;
  assert.ok(!high(p).includes("ai-label"));
});

test("твърдение без доказателство е MEDIUM (правилата на design-lint) → marketing-claims-review", () => {
  const p = good();
  p.posts[0].text = p.posts[0].hook + " Най-добрият link in bio — гарантирано.";
  const f = checkWeek(p).find((x) => x.code === "claim-needs-proof");
  assert.ok(f && f.sev === "MEDIUM" && /marketing-claims-review/.test(f.msg));
});

test("лимитите на платформите идват от post-lint (X: 280 знака)", () => {
  const p = good();
  p.posts[5].text = p.posts[5].hook + " " + "дълго ".repeat(60);
  assert.ok(high(p).includes("too-long"));
});

test("пакетът: по дни, с hook, текст, CTA и час; без нищо, което прилича на публикуване", () => {
  const md = renderPack(good());
  assert.match(md, /^# Седмица от една идея: Линк в био без комисиони/m);
  for (let d = 1; d <= 7; d++) assert.match(md, new RegExp(`## Ден ${d}`));
  assert.match(md, /Пробвай безплатно/);
  assert.match(md, /18:30/);
  assert.match(md, /ЧЕРНОВА — публикува човек/);
});

test("командите за Piuma: само Instagram с медия, само `draft`, текстът от файл", () => {
  const p = good();
  p.posts[0].media = "https://cdn.example/a.jpg";
  p.posts[0].alt = "Телефон с отворен профил";
  const cmds = piumaCommands(p, ".tmp/sedmitsa");
  assert.equal(cmds.length, 1, "вторият Instagram пост е без медия");
  assert.match(cmds[0].command, /^node tools\/social\/piuma\.mjs draft --brand linketto --media https:\/\/cdn\.example\/a\.jpg --caption-file \S+ --alt /);
  assert.doesNotMatch(cmds[0].command, /publish|approve|schedule/);
  assert.match(cmds[0].caption, /Пробвай безплатно/);
});

test("CLI: check → изход 1 при HIGH; render пише пакета в .tmp", () => {
  const dir = mkdtempSync(join(tmpdir(), "sedmitsa-"));
  try {
    const okFile = join(dir, "ok.json");
    writeFileSync(okFile, JSON.stringify(good()));
    const badFile = join(dir, "bad.json");
    writeFileSync(badFile, JSON.stringify({ ...good(), idea: "" }));
    const run = (...args) => spawnSync(process.execPath, [join(here, "sedmitsa.mjs"), ...args], { encoding: "utf8" });
    assert.equal(run("check", okFile).status, 0);
    const bad = run("check", badFile);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /no-idea/);
    const out = join(dir, "pack.md");
    assert.equal(run("render", okFile, "--out", out).status, 0);
    assert.match(readFileSync(out, "utf8"), /## Ден 7/);
    assert.equal(run("check", join(dir, "nyama.json")).status, 2, "липсващ файл — изход 2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
