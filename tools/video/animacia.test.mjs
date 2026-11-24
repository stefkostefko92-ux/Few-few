// Умението animacia (cth9191/animate + manim-skill, адаптирани 24.11.2026): предпазителите от двата прегледа
// (Кодаджията, Разбивача) — пътища в папката на парчето, числа за ffmpeg, JSON в <script>, браузър без мрежа,
// ffmpeg само с локални файлове — и цялото умение от край до край върху демото на стил „math“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, cpSync, writeFileSync, statSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { createServer } from "node:net";
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
  // ffprobe взима входа без -i (втори преглед, Разбивача т. 4) — оградата е най-отпред
  assert.deepEqual(safe.ffArgs(["-v", "error", "ref.jpg"], "ffprobe"), ["-protocol_whitelist", "file,pipe", "-v", "error", "ref.jpg"]);
});

test("inside/insideAny: symlink в парчето не изнася пътя навън (втори преглед, Разбивача т. 2)", () => {
  const w = mkdtempSync(join(tmpdir(), "animacia-ln-"));
  const base = join(w, "piece"), out = join(w, "outside");
  mkdirSync(join(base, "src"), { recursive: true }); mkdirSync(out);
  writeFileSync(join(out, "x.js"), "CANARY");
  symlinkSync(out, join(base, "lnk"));
  symlinkSync(join(out, "x.js"), join(base, "src", "x.js"));
  symlinkSync(join(out, "nyama"), join(base, "dangling"));
  assert.throws(() => safe.inside(base, "lnk/x.js"), /извън/);
  assert.throws(() => safe.inside(base, "src/x.js"), /извън/);
  assert.throws(() => safe.inside(base, "lnk/nov.wav"), /извън/, "нов файл в папка-symlink");
  assert.throws(() => safe.inside(base, "dangling"), /извън/, "висящ symlink");
  assert.throws(() => safe.insideAny([base], base, "lnk/x.js"), /извън/);
  assert.equal(safe.inside(base, "src/nov.js"), join(base, "src", "nov.js"));
  rmSync(w, { recursive: true, force: true });
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
  assert.ok(!/examples\/history-of-ai/.test(readFileSync(join(SKILL, "grammar", "FORMATS.md"), "utf8")), "няма препратка към махнатия пример");
  const setup = readFileSync(join(SKILL, "manim", "references", "setup-and-migration.md"), "utf8");
  assert.ok(!/uv run --python 3\.13 --with/.test(setup), "Manim не се тегли извън lock файла");
  assert.ok(/human installs|инсталира човекът|човекът инсталира/i.test(setup), "системните зависимости ги инсталира човекът");
  assert.match(readFileSync(join(TOOLS, "voice_words.py"), "utf8"), /local_files_only=True/, "моделът за думите — само от диска, и при пряко пускане");
});

test("марката: стилът crosshatch не носи логото и цвета на Claude в наши клипове (втори преглед, Правния)", () => {
  assert.ok(!/crosshatch for Claude Code explainers/.test(readFileSync(join(SKILL, "intake.md"), "utf8")));
  assert.match(readFileSync(join(SKILL, "styles", "crosshatch", "STYLE.md"), "utf8"), /trade mark of Anthropic/);
  assert.ok(!/\$ claude/.test(readFileSync(join(SKILL, "styles", "isometric", "demo", "src", "scenes.js"), "utf8")));
  const sk = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  assert.match(sk, /deep fake/, "т. 6 различава deep fake (AI Act чл. 50(4))");
  assert.match(sk, /dpa-review/, "т. 6: договор по чл. 28 ОРЗД");
  assert.match(sk, /marketing-claims-review/, "т. 5: твърденията през прегледа");
  assert.match(sk, /кадър по кадър/, "т. 5: без копие кадър по кадър");
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

test("Chromium без мрежа: WebRTC (TURN по TCP) не отваря връзка — нито от страницата, нито от iframe (втори преглед, Разбивача т. 1)", { timeout: 60_000 }, async () => {
  let hits = 0;
  const srv = createServer((c) => { hits++; c.destroy(); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const w = mkdtempSync(join(tmpdir(), "animacia-rtc-"));
  const html = join(w, "rtc.html");
  writeFileSync(html, `<!doctype html><script>
    const ice = { iceServers: [{ urls: "turn:127.0.0.1:${port}?transport=tcp", username: "u", credential: "p" }], iceTransportPolicy: "relay" };
    async function probe(PC) { try { const pc = new PC(ice); pc.createDataChannel("x"); await pc.setLocalDescription(await pc.createOffer()); } catch (e) {} }
    if (typeof RTCPeerConnection === "function") probe(RTCPeerConnection);
    const f = document.createElement("iframe"); document.body.appendChild(f);
    const PC2 = f.contentWindow && (f.contentWindow.RTCPeerConnection || f.contentWindow.webkitRTCPeerConnection);
    if (typeof PC2 === "function") probe(PC2);
  </script>`);
  const { chromium } = safe.playwright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("file://" + html);
    await new Promise((r) => setTimeout(r, 3000));
  } finally { await browser.close(); srv.close(); rmSync(w, { recursive: true, force: true }); }
  assert.equal(hits, 0, "TCP връзка към TURN сървъра от „офлайн“ браузъра");
});

test("от край до край: symlink в src/ и assets/ на парчето — build отказва (втори преглед, Разбивача т. 2)", { timeout: 60_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "animacia-"));
  const piece = join(work, "pieces", "ln"), out = join(work, "outside");
  cpSync(join(SKILL, "styles", "math", "demo"), piece, { recursive: true });
  mkdirSync(out);
  const pj = JSON.parse(readFileSync(join(piece, "piece.json"), "utf8"));
  const part = (pj.build || []).find((p) => p.startsWith("src/")) || "src/scenes.js";
  writeFileSync(join(out, "part.js"), readFileSync(join(piece, part), "utf8") + "\n// CANARY-srclink\n");
  rmSync(join(piece, part)); symlinkSync(join(out, "part.js"), join(piece, part));
  const b = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.notEqual(b.status, 0); assert.match(b.stderr, /извън/);
  rmSync(join(piece, part)); cpSync(join(out, "part.js"), join(piece, part));
  writeFileSync(join(out, "logo.png"), "CANARY-asset");
  mkdirSync(join(piece, "assets"), { recursive: true }); symlinkSync(join(out, "logo.png"), join(piece, "assets", "logo.png"));
  const b2 = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.notEqual(b2.status, 0); assert.match(b2.stderr, /symlink/);
  assert.ok(!existsSync(join(piece, "index.html")) || !readFileSync(join(piece, "index.html"), "utf8").includes(Buffer.from("CANARY-asset").toString("base64")));
});

test("от край до край: аудио пистата от страницата не пише извън renders/ (втори преглед, Разбивача т. 3)", { timeout: 120_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "animacia-"));
  const piece = join(work, "pieces", "stem");
  cpSync(join(SKILL, "styles", "math", "demo"), piece, { recursive: true });
  const b = spawnSync(process.execPath, [join(TOOLS, "build.mjs"), piece], { encoding: "utf8" });
  assert.equal(b.status, 0, b.stderr);
  const idx = join(piece, "index.html");
  const html = readFileSync(idx, "utf8"), end = html.lastIndexOf("</script>");
  writeFileSync(idx, html.slice(0, end) + 'window.renderAudioStems = async () => ({ "/../../../evil": "UklGRg==" });\n' + html.slice(end));
  const e = spawnSync(process.execPath, [join(TOOLS, "export.mjs"), piece, "--only-audio", "--no-mux"], { encoding: "utf8" });
  for (const d of [work, join(work, "pieces"), piece]) assert.ok(!existsSync(join(d, "evil.wav")), `файлът излезе от renders/ в ${d}`);
  assert.notEqual(e.status, 0, "export трябва да откаже името на пистата");
  assert.match(e.stderr, /stem/);
});
