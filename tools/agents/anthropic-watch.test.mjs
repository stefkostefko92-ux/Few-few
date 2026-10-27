// anthropic-watch.test.mjs — разборът и сравнението на снимките, без мрежа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDocsIndex, parseChangelog, parseEngineering, diffSnapshot, nextState, newer, clean, renderReport, STATE } from "./anthropic-watch.mjs";

const DOCS = `# Claude Code Docs
- [Overview](https://code.claude.com/docs/en/overview.md): Claude Code is…
- [Subagents](https://code.claude.com/docs/en/sub-agents.md): Create specialized…
- [Overview](https://code.claude.com/docs/en/overview.md): дубъл
- [Чужд сайт](https://example.com/x.md): не е документацията`;

const CHANGELOG = `# Claude Code changelog
**2.1.311**

October 26, 2026

**Added**

* Added \`experimental.cacheTtl\` to agent frontmatter
* \\[VSCode] Added syntax coloring to code blocks

**2.1.310**

October 23, 2026

* Fixed hooks not firing in subagents
`;

const ENG = `<a class="x" href="/research/how-we-contain-claude">How we contain Claude across products</a>
<a href="/engineering/demystifying-evals-for-ai-agents">Demystifying evals for AI agents</a>
<a href="/research/claude-think-tool">The &quot;think&quot; tool</a>
<a href="/research/how-we-contain-claude">дубъл</a>`;

test("parseDocsIndex: само страници от документацията, без дубли", () => {
  const d = parseDocsIndex(DOCS);
  assert.deepEqual(d.map((x) => x.url), ["https://code.claude.com/docs/en/overview.md", "https://code.claude.com/docs/en/sub-agents.md"]);
});

test("parseChangelog: версия, дата и редове; най-новата първа", () => {
  const c = parseChangelog(CHANGELOG);
  assert.deepEqual(c.map((v) => v.version), ["2.1.311", "2.1.310"]);
  assert.equal(c[0].date, "October 26, 2026");
  assert.equal(c[0].bullets.length, 2);
  assert.match(c[0].bullets[1], /^\[VSCode\]/, "екранираните скоби се връщат");
});

test("parseEngineering: /research/ и /engineering/ връзки, HTML същности, без дубли", () => {
  const e = parseEngineering(ENG);
  assert.deepEqual(e.map((x) => x.slug), ["how-we-contain-claude", "demystifying-evals-for-ai-agents", "claude-think-tool"]);
  assert.equal(e[2].title, "The \"think\" tool");
});

test("newer: числово, не лексикографски", () => {
  assert.ok(newer("2.1.311", "2.1.99"));
  assert.ok(!newer("2.1.99", "2.1.311"));
  assert.ok(!newer("2.1.311", "2.1.311"));
  assert.ok(newer("2.1.1", null));
});

test("diffSnapshot: нови страници, статии и версии; редовете за агентския процес отделно", () => {
  const prev = { changelogVersion: "2.1.310", docs: [{ url: "https://code.claude.com/docs/en/overview.md", title: "Overview" }, { url: "https://code.claude.com/docs/en/old.md", title: "Old" }], engineering: [{ slug: "claude-think-tool" }] };
  const cur = { docs: parseDocsIndex(DOCS), changelog: parseChangelog(CHANGELOG), engineering: parseEngineering(ENG) };
  const d = diffSnapshot(prev, cur);
  assert.deepEqual(d.newDocs.map((x) => x.title), ["Subagents"]);
  assert.deepEqual(d.removedDocs.map((x) => x.title), ["Old"]);
  assert.deepEqual(d.newVersions.map((v) => v.version), ["2.1.311"]);
  assert.deepEqual(d.newVersions[0].relevant, ["Added `experimental.cacheTtl` to agent frontmatter"], "VSCode оцветяването не е за флота");
  assert.deepEqual(d.newPosts.map((x) => x.slug), ["how-we-contain-claude", "demystifying-evals-for-ai-agents"]);
});

test("неуспешно сваляне не изтрива снимката и не измисля „махнати“ страници", () => {
  const prev = { checkedAt: "2026-10-20", changelogVersion: "2.1.310", docs: [{ url: "u1", title: "A" }], engineering: [{ slug: "s" }] };
  const cur = { changelog: parseChangelog(CHANGELOG) }; // docs и engineering паднаха
  const d = diffSnapshot(prev, cur);
  assert.equal(d.removedDocs.length, 0);
  assert.equal(d.newPosts.length, 0);
  const s = nextState(prev, cur, "2026-10-27");
  assert.deepEqual(s.docs, prev.docs);
  assert.deepEqual(s.engineering, prev.engineering);
  assert.equal(s.changelogVersion, "2.1.311");
  assert.match(renderReport(d, ["docs (HTTP 503)"]), /Не се свалиха: docs/);
});

test("първа проверка без снимка: всичко е ново, версията тръгва от най-новата", () => {
  const cur = { changelog: parseChangelog(CHANGELOG), docs: parseDocsIndex(DOCS), engineering: parseEngineering(ENG) };
  assert.equal(nextState(null, cur, "2026-10-27").changelogVersion, "2.1.311");
});

test("clean: маха управляващи и невидими знаци (външно съдържание = данни), реже дългото", () => {
  assert.equal(clean("a\u0000b​c‮d"), "a b c d");
  assert.ok(clean("я".repeat(500), 50).length <= 50);
});

test("записаната снимка в репото е валидна и непразна", () => {
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  assert.match(s.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(s.changelogVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(s.docs.length > 50 && s.engineering.length > 5, "снимката не е празна");
});
