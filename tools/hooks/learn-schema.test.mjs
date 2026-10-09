// learn-schema.test.mjs — проверено знание не изчезва тихо заради формата на блока (2026-10-09).
// Две реални пускания в една задача: AI-джията писа `claim:` + `status: verified` → 5 поуки с реален
// източник паднаха в Карантина; Летописецът писа `- id:` + `status:` + `rule: >` → 6 поуки, нула
// записани. Куката приключваше „успешно“ и в двата случая. Сега: `status:` се чете като увереност,
// а неразчетеното връща агента (dod-check) със схемата, която виждат и при старт (memory-preload).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseLearn, learnProblems, LEARN_SCHEMA } from "../../.claude/hooks/memory-capture.mjs";
import { checkLearnViolation, violationMessage } from "../../.claude/hooks/dod-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fence = (body) => "```learn\n" + body + "\n```";
const asst = (text) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });

// Формата на AI-джията от 2026-10-09 (съкратен текст, същите ключове).
const CLAIM_STATUS = fence([
  "agent: ai-djiyata",
  "lessons:",
  '  - claim: "Context engineering: контекстът да съдържа точно нужното за следващата стъпка."',
  "    status: verified",
  "    source: https://x.com/karpathy/status/1937902205765607626",
].join("\n"));

// Формата на Летописеца от 2026-10-09 (съкратен текст, същите ключове).
const ID_RULE = fence([
  "agent: letopisetsa",
  "lessons:",
  "  - id: ste-writing-rules",
  "    status: verified",
  "    source: https://www.asd-ste100.org/STE_faq.html",
  "    rule: >",
  "      В описания страдателен залог само ако вършителят е неизвестен.",
  "  - id: ste-about-approximately",
  "    status: verified",
  "    source: https://www.asd-ste100.org/STE_faq.html",
  "    rule: >",
  "      „about“ е одобрена само със значение „concerned with“.",
].join("\n"));

const CANON = fence([
  "agent: letopisetsa",
  "date: 2026-10-09",
  "lessons:",
  "  - text: В описания на STE страдателен залог само ако вършителят е неизвестен.",
  "    confidence: verified",
  "    source: https://www.asd-ste100.org/STE_faq.html",
  "    scope: английска техническа документация",
].join("\n"));

test("`status:` се чете като увереност — поуката с реален източник става проверена", () => {
  const r = parseLearn(CLAIM_STATUS.replace(/^```learn\n|\n```$/g, ""));
  assert.equal(r.lessons.length, 1);
  assert.equal(r.lessons[0].confidence, "verified");
  assert.equal(r.lessons[0].explicit, true);
  assert.deepEqual(learnProblems(CLAIM_STATUS), []);
});

test("`- id:` + `rule: >` не се разчита → проблем, не тих отпад", () => {
  const p = learnProblems(ID_RULE);
  assert.ok(p.length, "трябва да има проблем");
  assert.match(p.join(" "), /разчетени са 0 от 2/);
});

test("каноничната схема минава без проблеми; без блок — също", () => {
  assert.deepEqual(learnProblems(CANON), []);
  assert.deepEqual(learnProblems("само текст, без блок"), []);
  assert.deepEqual(learnProblems(fence("agent: seo\nlessons: []")), [], "празен списък е позволен");
});

test("многоредов текст, липсваща увереност и verified без източник се хващат поотделно", () => {
  const folded = fence("agent: seo\nlessons:\n  - text: >\n      нещо на втори ред\n    confidence: verified\n    source: a.mjs:1");
  assert.match(learnProblems(folded).join(" "), /многоредов/);
  const noConf = fence("agent: seo\nlessons:\n  - text: поука\n    source: a.mjs:1");
  assert.match(learnProblems(noConf).join(" "), /без „confidence:“/);
  const noSrc = fence("agent: seo\nlessons:\n  - text: поука\n    confidence: verified\n    source: none");
  assert.match(learnProblems(noSrc).join(" "), /без реален източник/);
});

test("източник като вложен списък не се брои за отделни поуки", () => {
  const nested = fence("agent: seo\nlessons:\n  - text: поука\n    confidence: verified\n    source: https://a.example/x\n    also:\n      - https://b.example/y\n      - https://c.example/z");
  assert.deepEqual(learnProblems(nested), []);
});

test("dod-check: неразчетен блок връща агента със схемата; блокът може да е в по-ранно съобщение", () => {
  const jl = [asst("Доклад…\n\n" + ID_RULE), asst("## ПРЕДАВАНЕ\nОт: letopisetsa → Към: ai-djiyata\nСтатус: наред")].join("\n");
  const v = checkLearnViolation(jl);
  assert.ok(v && v.kind === "learn");
  const msg = violationMessage(v);
  assert.ok(msg.includes(LEARN_SCHEMA), "отказът носи схемата");
  assert.equal(checkLearnViolation([asst(CANON)].join("\n")), null);
});

test("dod-check като кука: exit 2 при неразчетен блок, exit 0 при каноничния", () => {
  const dir = mkdtempSync(join(tmpdir(), "learn-schema-"));
  try {
    const handoff = "## ПРЕДАВАНЕ\nОт: kodadjiyata → Към: izpitatelya\nСтатус: наред\nИзход/артефакт: ревю\nСледваща стъпка: тест";
    const run = (text) => {
      const t = join(dir, "t.jsonl");
      writeFileSync(t, asst(text) + "\n");
      return spawnSync(process.execPath, [join(ROOT, ".claude", "hooks", "dod-check.mjs")], {
        input: JSON.stringify({ agent_transcript_path: t }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      });
    };
    const bad = run(ID_RULE + "\n\n" + handoff);
    assert.equal(bad.status, 2, bad.stderr);
    assert.match(bad.stderr, /confidence: verified\|probable\|unverified/);
    assert.equal(run(CANON + "\n\n" + handoff).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("memory-preload показва схемата на агента при старт", () => {
  const r = spawnSync(process.execPath, [join(ROOT, ".claude", "hooks", "memory-preload.mjs")], {
    input: JSON.stringify({ agent_type: "seo" }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(LEARN_SCHEMA));
});

// Таваните (анти-раздуване) изхвърлят поуката цяла и тихо — 2026-10-09 така изчезна проверена поука
// на AI-джията с обхват от ~260 знака. Сега това се казва на агента, преди да приключи.
test("над тавана и без source → казва се, не се изхвърля тихо", () => {
  const longScope = fence("agent: seo\nlessons:\n  - text: поука\n    confidence: verified\n    source: https://a.example/x\n    scope: " + "д".repeat(260));
  assert.match(learnProblems(longScope).join(" "), /scope 260>200/);
  const noSource = fence("agent: seo\nlessons:\n  - text: поука\n    confidence: verified");
  assert.match(learnProblems(noSource).join(" "), /без „source:“/);
});

// Резервният път за фонови агенти (capture-transcript.mjs) търсеше оградата в СУРОВИЯ JSONL, където
// новите редове са екранирани — и пропускаше всеки реален транскрипт като „без learn блок“.
test("capture-transcript разпознава learn блок в реален JSONL транскрипт", async () => {
  const { hasLearnBlock, transcriptHasLearn } = await import("../memory/capture-transcript.mjs");
  const jsonl = [asst("Доклад\n\n" + CANON)].join("\n");
  assert.equal(hasLearnBlock(jsonl), false, "суровият JSONL не носи истински нов ред — старият филтър слепее");
  assert.equal(transcriptHasLearn(jsonl), true);
  assert.equal(transcriptHasLearn(JSON.stringify({ type: "user", message: { role: "user", content: CANON } })), false, "learn блок в чуждо съобщение не се брои");
});
