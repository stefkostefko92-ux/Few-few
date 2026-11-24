// Умението animacia (cth9191/animate + manim-skill, адаптирани 24.11.2026): предпазителите от двата прегледа
// (Кодаджията, Разбивача) — пътища в папката на парчето, числа за ffmpeg, JSON в <script>, браузър без мрежа,
// ffmpeg само с локални файлове — и цялото умение от край до край върху демото на стил „math“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, cpSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = join(ROOT, ".claude", "skills", "animacia");
const TOOLS = join(SKILL, "scripts");
const safe = await import(join(TOOLS, "safe.mjs"));

test("inside: пътят остава в базата; ../, абсолютен и празен извън нея се отказват", () => {
  const base = "/tmp/piece";
  assert.equal(safe.inside(base, "src/a.js"), "/tmp/piece/src/a.js");
  assert.throws(() => safe.inside(base, "../../etc/passwd"), /извън/);
  assert.throws(() => safe.inside(base, "/etc/passwd"), /извън/);
  assert.throws(() => safe.inside(base, "src/../../x"), /извън/);
  assert.equal(safe.insideAny(["/tmp/piece", "/skill"], "/tmp/piece", "../../skill/kit/core.js"), "/skill/kit/core.js");
  assert.throws(() => safe.insideAny(["/tmp/piece", "/skill"], "/tmp/piece", "../../home/u/.env"), /извън/);
});

test("num: само крайно число в граници — иначе отказ (няма инжекция във филтъра на ffmpeg)", () => {
  assert.equal(safe.num(undefined, 0, -60, 24, "gain"), 0);
  assert.equal(safe.num("-3.5", 0, -60, 24, "gain"), -3.5);
  assert.throws(() => safe.num("0dB,amovie=/etc/passwd", 0, -60, 24, "gain"), /gain/);
  assert.throws(() => safe.num(99, 0, -60, 24, "gain"), /gain/);
  assert.throws(() => safe.num(NaN, 0, -60, 24, "gain"), /gain/);
});

test("name: имената на стил/ред са kebab — без пътища", () => {
  assert.equal(safe.name("cut-paper", "style"), "cut-paper");
  for (const bad of ["../x", "a/b", "", "A B", ".hidden"]) assert.throws(() => safe.name(bad, "style"), /style/);
});

test("jsonForScript: </script>, <!-- и U+2028 не могат да затворят inline <script>", () => {
  const s = safe.jsonForScript({ t: "</script><script>alert(1)</script>", c: "<!--", ls: "a b", amp: "&" });
  assert.ok(!/<\/script/i.test(s) && !s.includes("<!--") && !s.includes(" ") && !s.includes("&"));
  assert.deepEqual(JSON.parse(s), { t: "</script><script>alert(1)</script>", c: "<!--", ls: "a b", amp: "&" });
});

test("ffArgs: всеки вход -i на ffmpeg/ffprobe е само файл или pipe", () => {
  assert.deepEqual(safe.ffArgs(["-y", "-i", "a.wav", "-i", "b.wav", "out.wav"]),
    ["-y", "-protocol_whitelist", "file,pipe", "-i", "a.wav", "-protocol_whitelist", "file,pipe", "-i", "b.wav", "out.wav"]);
});

test("кодът на умението: без npm root -g / execSync, без capture.mjs, без облачния глас; Playwright само през safe.mjs", () => {
  const files = [];
  (function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(SKILL);
  const code = files.filter((f) => /\.(mjs|js|py)$/.test(f));
  for (const f of code) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/npm root -g|execSync\(/.test(s), `${f}: npm root -g / execSync`);
    if (!f.endsWith("safe.mjs")) assert.ok(!/require\(['"]playwright['"]\)/.test(s), `${f}: Playwright покрай safe.mjs`);
  }
  assert.ok(!existsSync(join(TOOLS, "capture.mjs")) && !existsSync(join(SKILL, "tools")), "capture.mjs е махнат; скриптовете са в scripts/");
  const md = files.filter((f) => f.endsWith(".md")).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(!/ElevenLabs connector|ElevenLabs MCP/i.test(md), "инструкциите за ElevenLabs са махнати");
  assert.ok(!/npm i -g|pip install faster-whisper|uv pip install/.test(md), "инсталации без човек");
  assert.ok(!existsSync(join(SKILL, "examples", "history-of-ai")), "примерът с реални хора е махнат");
});

test("от край до край: демото на „math“ се билдва и рендира кадър без нито една мрежова заявка", { timeout: 180_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "animacia-"));
  const piece = join(work, "pieces", "demo");
  cpSync(join(SKILL, "styles", "math", "demo"), piece, { recursive: true });
  const b = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.equal(b.status, 0, b.stderr || b.stdout);
  const png = join(work, "still.png");
  const s = spawnSync(process.execPath, [join(TOOLS, "still.mjs"), piece, "1", png, "--scale", "0.25"], { encoding: "utf8" });
  assert.equal(s.status, 0, s.stderr || s.stdout);
  assert.ok(existsSync(png) && statSync(png).size > 1000, "кадърът е нарисуван");
});

test("от край до край: piece.json с път извън парчето и voice.json с </script> не минават", { timeout: 60_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "animacia-"));
  const piece = join(work, "pieces", "evil");
  cpSync(join(SKILL, "styles", "math", "demo"), piece, { recursive: true });
  const pj = JSON.parse(readFileSync(join(piece, "piece.json"), "utf8"));
  writeFileSync(join(piece, "piece.json"), JSON.stringify({ ...pj, build: ["src/head.html", "../../../../etc/hostname"] }));
  const b = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /извън/);

  writeFileSync(join(piece, "piece.json"), JSON.stringify(pj));
  writeFileSync(join(piece, "voice.json"), JSON.stringify({ duration: 1, lines: [{ id: "a", text: "</script><script>x()</script>", t0: 0, t1: 1, words: [] }] }));
  const b2 = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.equal(b2.status, 0, b2.stderr);
  const html = readFileSync(join(piece, "index.html"), "utf8");
  assert.equal((html.match(/<\/script>/gi) || []).length, 1, "един-единствен затварящ </script>");
});
