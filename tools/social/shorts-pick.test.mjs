// shorts-pick.test.mjs — кандидати за Shorts от дълго видео (идея от youtube-agent-skill, наш код).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hookScore, pickShorts } from "./shorts-pick.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const cue = (start, end, text) => ({ start, end, text });

test("hookScore: въпрос, число и силна дума вдигат; започване по средата на мисъл сваля", () => {
  const strong = hookScore("Защо 90% от постовете не взимат гледания?", { prevEndsSentence: true });
  const weak = hookScore("и после натиснахме бутона", { prevEndsSentence: false });
  assert.ok(strong.score > weak.score);
  assert.ok(strong.reasons.includes("въпрос"));
  assert.ok(strong.reasons.includes("число"));
  assert.ok(weak.reasons.includes("започва по средата"));
});

test("pickShorts: граници по репликите, дължина в рамките, без застъпване, най-силният hook първи", () => {
  const cues = [
    cue(0, 5, "Здравейте, днес говорим за обхвата."),
    cue(5, 12, "и после натиснахме бутона, за да видим какво става"),
    cue(12, 20, "Това беше скучната част."),
    cue(20, 26, "Защо 90% от постовете не взимат гледания?"),
    cue(26, 34, "Защото първите три секунди не казват нищо."),
    cue(34, 42, "Ето как да го оправиш с едно изречение."),
    cue(42, 50, "Пробвай го на следващия си пост."),
    cue(50, 58, "и така нататък, още малко за настройките"),
  ];
  const r = pickShorts(cues, { min: 15, max: 35, top: 3 });
  assert.ok(r.length >= 1);
  assert.equal(r[0].start, 20, JSON.stringify(r[0]));
  assert.match(r[0].hook, /^Защо 90%/);
  for (const c of r) {
    assert.ok(c.duration >= 15 && c.duration <= 35, JSON.stringify(c));
    assert.ok(cues.some((x) => x.start === c.start) && cues.some((x) => x.end === c.end), "границите са реплики");
  }
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    assert.ok(r[i].end <= r[j].start || r[j].end <= r[i].start, "без застъпване");
});

test("pickShorts: прекалено кратък транскрипт → празен списък, не грешка", () => {
  assert.deepEqual(pickShorts([cue(0, 4, "Кратко.")], { min: 15, max: 60, top: 3 }), []);
});

test("CLI: транскрипт → JSON с кандидати; без вход → изход 2", () => {
  const d = mkdtempSync(join(tmpdir(), "shorts-"));
  try {
    const srt = [[0, 10, "Защо никой не гледа видеата ти?"], [10, 20, "Защото hook-ът идва късно."], [20, 30, "Сложи го в първата секунда."]]
      .map(([s, e, t], i) => `${i + 1}\n00:00:${String(s).padStart(2, "0")},000 --> 00:00:${String(e).padStart(2, "0")},000\n${t}\n`).join("\n");
    writeFileSync(join(d, "t.srt"), srt);
    const r = spawnSync(process.execPath, [join(HERE, "shorts-pick.mjs"), join(d, "t.srt"), "--min", "15", "--max", "30", "--json"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.candidates[0].start, 0);
    assert.equal(spawnSync(process.execPath, [join(HERE, "shorts-pick.mjs")], { encoding: "utf8" }).status, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
