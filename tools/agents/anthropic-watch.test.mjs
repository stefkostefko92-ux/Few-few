// anthropic-watch.test.mjs — разборът и сравнението на снимките, без мрежа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDocsIndex, parseChangelog, parseEngineering, parseSkillsMarketplace, diffSnapshot, nextState, newer, clean, renderReport, STATE } from "./anthropic-watch.mjs";

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
  assert.ok(Array.isArray(s.skills) && s.skills.length >= 10, "снимката на anthropics/skills е записана");
  for (const x of s.skills) assert.match(x.id, /^[a-z0-9-]+\/[a-z0-9-]+$/, `умение ${x.id}`);
});

const MARKETPLACE = JSON.stringify({
  name: "anthropic-agent-skills",
  plugins: [
    { name: "document-skills", skills: ["./skills/xlsx", "./skills/docx"] },
    { name: "example-skills", skills: ["./skills/frontend-design", "./skills/frontend-design"] },
    { name: "discernment-nudge", skills: ["./skills/discernment-nudge"] },
    { name: "bad", skills: ["../../etc/passwd", "./skills/../x", 42, "./skills/Bad Name", "./skills/ok"] },
    { name: "лош плъгин", skills: ["./skills/fine"] },
  ],
});

test("parseSkillsMarketplace: плъгин/умение от marketplace.json, без дубли и без чужди пътища", () => {
  const s = parseSkillsMarketplace(MARKETPLACE);
  assert.deepEqual(s.map((x) => x.id), ["document-skills/xlsx", "document-skills/docx", "example-skills/frontend-design", "discernment-nudge/discernment-nudge", "bad/ok"]);
  assert.equal(s[0].skill, "xlsx");
  assert.deepEqual(parseSkillsMarketplace("не е JSON"), [], "счупен файл → празно, не изключение");
});

test("diffSnapshot: нови и махнати умения в anthropics/skills; снимка без умения е начална точка", () => {
  const cur = { skills: parseSkillsMarketplace(MARKETPLACE) };
  const prev = { skills: [{ id: "document-skills/xlsx", plugin: "document-skills", skill: "xlsx" }, { id: "example-skills/webapp-testing", plugin: "example-skills", skill: "webapp-testing" }] };
  const d = diffSnapshot(prev, cur);
  assert.deepEqual(d.newSkills.map((x) => x.id), ["document-skills/docx", "example-skills/frontend-design", "discernment-nudge/discernment-nudge", "bad/ok"]);
  assert.deepEqual(d.removedSkills.map((x) => x.id), ["example-skills/webapp-testing"]);
  const r = renderReport(d, []);
  assert.match(r, /Нови умения в anthropics\/skills \(4\)/);
  assert.match(r, /https:\/\/github\.com\/anthropics\/skills\/tree\/main\/skills\/discernment-nudge/);
  assert.match(r, /Махнати умения/);
  assert.doesNotMatch(r, /Няма новости/, "само нови умения пак са новост");
  // Стара снимка от преди източника: не вдига всичките 20 умения като „нови“.
  const base = diffSnapshot({ checkedAt: "2026-10-31", docs: [] }, cur);
  assert.equal(base.newSkills.length, 0);
  assert.deepEqual(nextState({ checkedAt: "2026-10-31" }, cur, "2026-11-08").skills.map((x) => x.id), cur.skills.map((x) => x.id));
  // Неуспешно сваляне на умения пренася старата снимка.
  assert.deepEqual(nextState(prev, {}, "2026-11-08").skills, prev.skills);
  assert.equal(diffSnapshot(prev, {}).removedSkills.length, 0);
});

test("договорите с харнеса: ред от changelog-а, който ги засяга, излиза първи", async () => {
  const { touchedContracts, loadContracts } = await import("./anthropic-watch.mjs");
  const contracts = loadContracts();
  assert.ok(contracts.length >= 10, "регистърът на договорите е зареден");
  for (const c of contracts) {
    assert.match(c.source, /^https:\/\//, `${c.id}: без източник`);
    assert.ok(c.keywords.length && c.relies.length, `${c.id}: ключови думи и файлове`);
  }
  assert.ok(touchedContracts("Changed hook additionalContext limit to 20,000 characters", contracts).includes("additional-context-10k"));
  assert.ok(touchedContracts("Fixed skills not preloading into subagents", contracts).includes("skills-preload-subagent"));
  // Boris Cherny, 30.03.2026: -p и SDK ще минат на --bare по подразбиране → live-run губи куките.
  assert.ok(touchedContracts("Changed `claude -p` to default to --bare mode", contracts).includes("print-mode-loads-hooks"));
  assert.deepEqual(touchedContracts("[VSCode] Added syntax coloring to code blocks", contracts), []);
  // Шум от 2.1.317–2.1.319 (08.11.2026): 41 от 53 удара бяха поднизове („ws“ в shows/AWS, „timeout“, „compaction“ …).
  for (const noise of [
    "Added an optional `login_notice` setting to the Claude apps gateway that shows an operator-defined message",
    "Added `assume_role` on `mantle` upstreams of the Claude apps gateway, for a role in another AWS account",
    "Improved config saves on Windows: Claude Code waits longer for a file another program has open",
    "Fixed needless permission prompts for read-only commands wrapped in a plain `timeout DURATION`, such as `timeout 30 rg foo`",
    "Improved auto-update reliability: a brief network failure while verifying a release is now retried right away",
    "Fixed idle compaction replacing a conversation with a reply that was not a summary",
    "Changed exit to skip the \"Background work is running\" prompt for plugin monitors",
    "Fixed workflows re-running finished agents when resumed after a usage limit",
    "[VSCode] Fixed `ultrathink` not raising effort for its turn or showing its rainbow when telemetry is off",
    "Fixed agent team teammates in tmux or iTerm2 panes starting in auto mode when the lead session was in manual mode",
  ]) assert.deepEqual(touchedContracts(noise, contracts), [], noise);
  // Истинските удари остават.
  assert.ok(touchedContracts("Changed Monitor's WebSocket watch to follow a rule on every Bash command", contracts).includes("monitor-bash-hooks"));
  assert.ok(touchedContracts("Hooks with a Bash matcher now also run for the Monitor tool's shell commands", contracts).includes("monitor-bash-hooks"));
  assert.ok(touchedContracts("Changed subagents and teammates on a different model to use that model's saved effort level", contracts).includes("subagent-effort-env"));
  assert.ok(touchedContracts("Changed skills to keep the first 10,000 tokens after compaction", contracts).includes("skill-compaction-5k"));
  assert.ok(touchedContracts("Fixed hook timeout not honoring onFailure", contracts).includes("hook-onfailure-default"));
  assert.ok(touchedContracts("Raised the workflow concurrency limit to 32", contracts).includes("workflow-concurrency-cap"));
  // Ключ-масив изисква всички части; празен масив не удря.
  assert.deepEqual(touchedContracts("a skill", [{ id: "x", keywords: [["skill", "compact"]] }]), []);
  assert.deepEqual(touchedContracts("anything", [{ id: "x", keywords: [[]] }]), []);
  const d = diffSnapshot({ changelogVersion: "2.1.310" }, { changelog: [{ version: "2.1.311", date: "", bullets: ["Changed hook additionalContext limit to 20,000 characters"] }] }, contracts);
  assert.equal(d.contractHits.length, 1);
  assert.match(renderReport(d, []), /ЗАСЯГАТ ДОГОВОР С ХАРНЕСА/);
});
