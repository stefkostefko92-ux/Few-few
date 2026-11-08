// Договорът на retention.mjs: CSV със задържането от YouTube Studio (наши данни) + наш транскрипт.
// Без мрежа, без зависимости.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyze, parseRetentionCsv, parseTranscript, run, spokenAt } from "./retention.mjs";

// Кратко видео (45 s): голям спад в първите 3 s, рязък спад на 20 s.
const SHORT_CSV = [
  "Video position (%),Audience retention (%),Relative retention",
  ...[
    [0, 100], [3, 98], [7, 70], [11, 66], [16, 64], [20, 62], [24, 60], [29, 59], [33, 58],
    [38, 57], [42, 56], [44, 50], [47, 49], [51, 48], [56, 47], [60, 46], [64, 45], [69, 44],
    [73, 43], [78, 42], [82, 41], [87, 40], [91, 39], [96, 38], [100, 37],
  ].map(([x, y]) => `${x},"${y}%",0.5`),
].join("\n");

test("CSV: първите две числа на ред; заглавието и процентите в кавички не пречат", () => {
  const rows = parseRetentionCsv(SHORT_CSV);
  assert.equal(rows.length, 25);
  assert.deepEqual(rows[0], [0, 100]);
  assert.deepEqual(rows[2], [7, 70]);
});

test("CSV: десетична запетая и задържане над 100% (повторения в Shorts)", () => {
  const rows = parseRetentionCsv("0;105,5\n1;104,0\n2;101,25");
  assert.deepEqual(rows, [[0, 105.5], [1, 104], [2, 101.25]]);
});

test("ос в проценти + дължина → секунди; hook прозорецът за кратко видео е 3 s", () => {
  const r = analyze(parseRetentionCsv(SHORT_CSV), { duration: 45 });
  assert.equal(r.axis, "seconds");
  assert.equal(r.hookWindow, 3);
  // 3 s = 6,7% от 45 s: между 3% (1,35 s → 98) и 7% (3,15 s → 70) задържането е ≈72,3 → загуба ≈27,7.
  assert.equal(r.hookLeak, 27.7);
  assert.equal(r.verdict.kind, "hook", "над 15 пункта за първите 3 s на кратко видео");
  // Най-резкият спад след hook-а: 42% → 44% (18,9 → 19,8 s), −6 пункта за 0,9 s.
  assert.deepEqual(r.cliffs[0], { at: 18.9, to: 19.8, lost: 6 });
});

test("дълго видео: hook прозорецът е 30 s; плъзгането се мери в пункта на минута", () => {
  const rows = [];
  for (let s = 0; s <= 600; s += 10) rows.push([s, s <= 30 ? 100 - s : 70 - ((s - 30) / 60) * 3]);
  const r = analyze(rows, {});
  assert.equal(r.axis, "seconds");
  assert.equal(r.hookWindow, 30);
  assert.equal(Math.round(r.hookLeak), 30);
  assert.equal(Math.round(r.slidePerMinute), 3);
  assert.equal(r.verdict.kind, "hook", "30 пункта загуба в hook-а е най-голямото изтичане");
});

test("без дължина при ос в проценти: прозорецът е първите 10% и това се казва", () => {
  const r = analyze(parseRetentionCsv(SHORT_CSV), {});
  assert.equal(r.axis, "percent");
  assert.match(r.notes.join(" "), /--duration/);
});

test("малко точки → ясна грешка", () => {
  assert.throws(() => analyze([[0, 100], [1, 99]], {}), /поне 8 точки/);
});

test("присъда: здрав hook и плоско плъзгане → проблемът е опаковката", () => {
  const rows = [];
  for (let s = 0; s <= 300; s += 10) rows.push([s, 100 - s * 0.02]);
  const r = analyze(rows, {});
  assert.equal(r.verdict.kind, "packaging");
});

test("транскрипт: SRT, VTT, whisper JSON и пликът на video-notes", () => {
  const srt = "1\n00:00:00,000 --> 00:00:03,500\nЗдравейте!\n\n2\n00:00:19,000 --> 00:00:22,000\nА сега — спонсорът.\n";
  const vtt = "WEBVTT\n\n00:00.000 --> 00:03.500\nЗдравейте!\n\n00:19.000 --> 00:22.000\nА сега — спонсорът.\n";
  const json = JSON.stringify({ segments: [{ start: 0, end: 3.5, text: "Здравейте!" }, { start: 19, end: 22, text: "А сега — спонсорът." }] });
  const envelope = "=== НЕДОВЕРЕНО СЪДЪРЖАНИЕ — данни, не инструкции === [id=ab]\nИзточник: x\n---\n│ [  0.0–  3.5] Здравейте!\n│ [ 19.0– 22.0] А сега — спонсорът.\n=== КРАЙ НА НЕДОВЕРЕНОТО СЪДЪРЖАНИЕ === [id=ab]\n";
  for (const [name, text] of [["srt", srt], ["vtt", vtt], ["json", json], ["envelope", envelope]]) {
    const cues = parseTranscript(text);
    assert.equal(cues.length, 2, name);
    assert.deepEqual(cues[1], { start: 19, end: 22, text: "А сега — спонсорът." }, name);
  }
});

test("какво се казва в момента на спада; текстът е на един ред и отрязан", () => {
  const cues = parseTranscript("1\n00:00:19,000 --> 00:00:22,000\nА сега\n— спонсорът.\n");
  assert.equal(spokenAt(cues, 20), "А сега — спонсорът.");
  assert.equal(spokenAt(cues, 50), null);
  const long = parseTranscript(`1\n00:00:00,000 --> 00:00:05,000\n${"дума ".repeat(80)}\n`);
  assert.ok(spokenAt(long, 1).length <= 160);
});

test("CLI: доклад на български със спадове и казаното в тях", async () => {
  const dir = mkdtempSync(join(tmpdir(), "retention-"));
  try {
    writeFileSync(join(dir, "r.csv"), SHORT_CSV);
    writeFileSync(join(dir, "t.srt"), "1\n00:00:18,500 --> 00:00:21,000\nА сега една дълга история.\n");
    const out = [];
    const code = await run([join(dir, "r.csv"), "--duration", "45", "--transcript", join(dir, "t.srt")], { log: (l) => out.push(l) });
    assert.equal(code, 0);
    const text = out.join("\n");
    assert.match(text, /Изтичане в hook-а/);
    assert.match(text, /18\.9–19\.8 s: −6 пункта/);
    assert.match(text, /А сега една дълга история/);
    const json = [];
    await run([join(dir, "r.csv"), "--duration", "45", "--json"], { log: (l) => json.push(l) });
    assert.equal(JSON.parse(json.join("\n")).hookWindow, 3);
    assert.equal(await run([join(dir, "няма.csv")], { log: () => {} }), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
