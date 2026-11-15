import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewTask, verdictOf, findingsOf, recordRuns, renderReport, learnTranscript, FOCUS, REVIEW_ALLOWED } from "./pr-review.mjs";
import { assistantTexts } from "../../.claude/hooks/memory-capture.mjs";

const pr = { pr: 326, title: "fix(cspos): Next.js 15.5.28", ref: "claude/nextjs-security-cspos", sha: "8cd42fd505e31efa" };

test("задачата казва къде е diff-ът, че агентският слой е текущият, фокуса и формата на присъдата", () => {
  const t = reviewTask(pr, "kasadjiyata");
  assert.match(t, /\.pr-review\/326\.diff/);
  assert.match(t, /ТЕКУЩИЯТ агентски слой/);
  assert.match(t, new RegExp(FOCUS.kasadjiyata.slice(0, 20)));
  assert.match(t, /Присъда: блокер/);
  assert.match(t, /нищо не пиши/);
  assert.match(reviewTask(pr, "непознат"), /своя домейн/);
});

test("присъдата: изричен ред → статус от ПРЕДАВАНЕ → „?“", () => {
  assert.equal(verdictOf("Присъда: чисто\n…"), "чисто");
  assert.equal(verdictOf("**Присъда: блокер**"), "блокер");
  assert.equal(verdictOf("…\n## ПРЕДАВАНЕ\nСтатус: частично\n"), "поправки");
  assert.equal(verdictOf("нищо"), "?");
});

test("находките идват от реда в ПРЕДАВАНЕ, с таван", () => {
  assert.equal(findingsOf("Находки: a.ts:3 XSS (Сигурно)\nИзход/артефакт: —"), "a.ts:3 XSS (Сигурно)");
  assert.equal(findingsOf("Находки: " + "x".repeat(900)).length, 600);
  assert.equal(findingsOf("без блок"), "");
});

test("дневникът брои само успешните пускания и не дублира агент на същия sha", () => {
  const l = recordRuns({ reviewed: { abc: ["kodadjiyata"] }, runs: [] }, [
    { ok: true, sha: "abc", agent: "kodadjiyata", pr: 1, text: "Присъда: чисто", costUsd: 0.5 },
    { ok: true, sha: "abc", agent: "kasadjiyata", pr: 1, text: "Присъда: блокер", costUsd: 1.234 },
    { ok: false, sha: "def", agent: "seo", pr: 2, text: "", costUsd: 0 },
  ], "2026-10-27");
  assert.deepEqual(l.reviewed.abc, ["kasadjiyata", "kodadjiyata"]);
  assert.equal(l.reviewed.def, undefined);
  assert.deepEqual(l.runs.map((r) => r.verdict), ["чисто", "блокер"]);
  assert.equal(l.runs[1].costUsd, 1.23);
});

test("докладът подрежда по най-тежката присъда — блокерите първи", () => {
  const md = renderReport([
    { pr: 5, title: "чист", agent: "kodadjiyata", ok: true, text: "Присъда: чисто", costUsd: 0.1 },
    { pr: 4, title: "лош", agent: "kodadjiyata", ok: true, text: "Присъда: блокер\nНаходки: x.ts:1 RCE", costUsd: 0.2 },
    { pr: 4, title: "лош", agent: "seo", ok: false, text: "", costUsd: 0 },
  ]);
  assert.ok(md.indexOf("#4 — блокер") < md.indexOf("#5 — чисто"));
  assert.match(md, /x\.ts:1 RCE/);
  assert.match(md, /неуспешно пускане/);
});

test("поуките от прегледа стигат до учебния hook: транскриптът се чете от същия парсер", () => {
  const text = "Присъда: чисто\n```learn\nagent: kodadjiyata\nlessons:\n  - text: x\n```";
  assert.deepEqual(assistantTexts(learnTranscript(text).split("\n")), [text]);
});

test("прегледът получава само четящи Bash команди", () => {
  const bash = REVIEW_ALLOWED.filter((a) => a.startsWith("Bash"));
  assert.ok(bash.length >= 3);
  for (const b of bash) assert.match(b, /^Bash\((git (diff|log|show)|bash tools\/code\/scan\.sh|node tools\/agents\/verifier\.mjs|npm view|npm pack \* --dry-run)\s?\*\)$/);
});
