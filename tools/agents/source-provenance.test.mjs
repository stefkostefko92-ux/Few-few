// source-provenance.test.mjs — „проверена“ поука иска източник, реално отворен в рън-а на агента.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { refsOf, seenIn, unseenRefs } from "./source-provenance.mjs";

const line = (role, content) => JSON.stringify({ message: { role, content } });
const transcript = [
  line("assistant", [{ type: "tool_use", name: "WebFetch", input: { url: "https://code.claude.com/docs/en/skills.md" } }]),
  line("assistant", [{ type: "tool_use", name: "Bash", input: { command: "cd CSPos && sed -n 200,210p prisma/schema.prisma" } }]),
  line("assistant", [{ type: "tool_use", name: "Bash", input: { command: "for p in routines costs; do curl -s https://code.claude.com/docs/en/$p.md; done" } }]),
  line("user", [{ type: "tool_result", content: "SupremeDiscordBot/bot/src/events/interactionCreate.js:1744: …" }]),
  line("assistant", [{ type: "tool_use", name: "WebSearch", input: { query: "uk adequacy renewal" } }]),
  line("user", [{ type: "tool_result", content: "https://www.hunton.com/blog/uk-adequacy … snippet" }]),
  line("user", "Stop hook feedback: [node .claude/hooks/dod-check.mjs]: договорът ПРЕДАВАНЕ е нарушен"),
].join("\n");
const view = seenIn(transcript);

test("изтеглен адрес (и с котва, и без .md), прочетен файл след cd, адрес от цикъл, обратна връзка от кука", () => {
  assert.deepEqual(unseenRefs("https://code.claude.com/docs/en/skills#run-your-checks-before-each-commit", view), []);
  assert.deepEqual(unseenRefs("CSPos/prisma/schema.prisma:205", view), []);
  assert.deepEqual(unseenRefs("https://code.claude.com/docs/en/routines.md", view), []);
  assert.deepEqual(unseenRefs("SupremeDiscordBot/bot/src/events/interactionCreate.js:1744", view), []);
  assert.deepEqual(unseenRefs("Stop hook dod-check.mjs обратна връзка", view), []);
});

test("неизтеглен адрес (само в търсене), неотворен файл, грешен път → непроверено", () => {
  assert.deepEqual(unseenRefs("https://www.hunton.com/blog/uk-adequacy", view), ["https://www.hunton.com/blog/uk-adequacy"]);
  assert.deepEqual(unseenRefs("medqr/src/server.js:184", view), ["medqr/src/server.js"]);
  assert.deepEqual(unseenRefs("bot/src/interactionCreate.js:1744", view), ["bot/src/interactionCreate.js"]);
});

test("refsOf: изброяване и шаблони със скоби не са пътища или адреси", () => {
  assert.deepEqual(refsOf("Grep в .pr-review/296.diff (само .env.example/CLAUDE.md/DEPLOY.md)").files, [".pr-review/296.diff"]);
  assert.deepEqual(refsOf("grep в https://code.claude.com/docs/en/{env-vars,hooks}.md").urls, []);
  assert.deepEqual(refsOf("node tools/agents/oversee.mjs → 0 твърди").files, ["tools/agents/oversee.mjs"]);
});

test("memory-capture ползва проверката на произхода", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../.claude/hooks/memory-capture.mjs"), "utf8");
  assert.match(src, /unseenRefs\(les\.source, provenance\)/);
});
