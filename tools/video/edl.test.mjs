// edl.test.mjs — списък с предложени срезове от транскрипт + тишини (идея от youtube-agent-skill, наш код).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSilence, proposeEdl, isFillerOnly } from "./edl.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("parseSilence чете изхода на ffmpeg silencedetect; незатворената тишина се затваря с duration", () => {
  const log = [
    "[silencedetect @ 0x1] silence_start: 1.0",
    "[silencedetect @ 0x1] silence_end: 3.0 | silence_duration: 2.0",
    "frame=  10 fps=0.0 q=-0.0 size=N/A",
    "[silencedetect @ 0x1] silence_start: 9.5",
  ].join("\n");
  assert.deepEqual(parseSilence(log), [{ start: 1, end: 3 }, { start: 9.5, end: null }]);
  assert.deepEqual(parseSilence(log, { duration: 10 }), [{ start: 1, end: 3 }, { start: 9.5, end: 10 }]);
});

test("isFillerOnly: само паразитни звуци (BG/EN), не реплика с думи", () => {
  for (const t of ["ъъъ", "Ъм...", "ммм, ъъ", "um", "uh, erm", "е-е-е"]) assert.ok(isFillerOnly(t), t);
  for (const t of ["ъъ, днес ще ви покажа", "um so we start", "ами да", "нали"]) assert.ok(!isFillerOnly(t), t);
});

test("proposeEdl: тишина ≥ прага с отстъп, паразитна реплика, повторен старт; сливане и сума", () => {
  const cues = [
    { start: 0.0, end: 1.0, text: "Днес ще ви покажа" },
    { start: 3.2, end: 6.0, text: "Днес ще ви покажа как се прави клип." },
    { start: 6.1, end: 6.6, text: "ъъъ" },
    { start: 6.7, end: 9.0, text: "um so we start here" },
  ];
  const silences = [{ start: 1.0, end: 3.2 }, { start: 9.0, end: 9.4 }];
  const r = proposeEdl({ cues, silences, minSilence: 0.7, pad: 0.15 });
  const kinds = r.cuts.map((c) => c.kind);
  assert.deepEqual(kinds, ["повтор", "тишина", "филър"]);
  const silence = r.cuts.find((c) => c.kind === "тишина");
  assert.deepEqual([silence.start, silence.end], [1.15, 3.05]);
  assert.ok(!r.cuts.some((c) => c.start >= 9), "0,4 s тишина е под прага");
  assert.ok(r.hints.some((h) => h.kind === "филър в реплика" && h.at === 6.7), "паразит вътре в реплика е подсказка, не срез");
  assert.equal(r.totalCut, Number(r.cuts.reduce((s, c) => s + (c.end - c.start), 0).toFixed(2)));
});

test("proposeEdl: застъпващи се срезове се сливат; нищо не се реже", () => {
  const cues = [{ start: 0, end: 1, text: "ъъ" }];
  const r = proposeEdl({ cues, silences: [{ start: 0.5, end: 2.5 }], minSilence: 0.7, pad: 0.15 });
  assert.equal(r.cuts.length, 1);
  assert.deepEqual([r.cuts[0].start, r.cuts[0].end], [0, 2.35]);
  assert.match(r.note, /само предложение/);
});

test("CLI: --subs и --silence → JSON; без вход → изход 2 с употреба", () => {
  const d = mkdtempSync(join(tmpdir(), "edl-"));
  try {
    writeFileSync(join(d, "t.srt"), "1\n00:00:00,000 --> 00:00:01,000\nъъъ\n\n2\n00:00:02,000 --> 00:00:04,000\nЗдравейте.\n");
    writeFileSync(join(d, "s.log"), "silence_start: 1.0\nsilence_end: 2.0 | silence_duration: 1.0\n");
    const r = spawnSync(process.execPath, [join(HERE, "edl.mjs"), "--subs", join(d, "t.srt"), "--silence", join(d, "s.log")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(j.cuts.length >= 1);
    const bad = spawnSync(process.execPath, [join(HERE, "edl.mjs")], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /--subs/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
