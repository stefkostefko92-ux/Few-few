// dod-check.test.mjs — DoD-enforcement hook логиката (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectToolUses, checkDoD, bashWrites } from "../../.claude/hooks/dod-check.mjs";

const jl = (objs) => objs.map((o) => JSON.stringify(o)).join("\n");

test("писан .lua без manifest-lint → нарушение", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "resources/shop/server.lua" } }] } },
    { message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls -la" } }] } },
  ]));
  const v = checkDoD(uses);
  assert.equal(v.length, 1);
  assert.match(v[0].gate, /manifest-lint/);
});

test("писан .lua + пуснат manifest-lint → чисто", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "resources/shop/client.lua" } }] } },
    { message: { content: [{ type: "tool_use", name: "Bash", input: { command: "node tools/fivem/manifest-lint.mjs resources/shop" } }] } },
  ]));
  assert.equal(checkDoD(uses).length, 0);
});

test("deploy .sh без deploy-check → нарушение; seed без check-dups → нарушение", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "deploy/autodeploy.sh" } }] } },
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "zabobovdol/prisma/seed-apteki.ts" } }] } },
  ]));
  const v = checkDoD(uses);
  assert.equal(v.length, 2);
});

test("агентска дефиниция без oversee → нарушение; с oversee → чисто", () => {
  const wrote = { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: ".claude/agents/geymara.md" } }] } };
  assert.equal(checkDoD(collectToolUses(jl([wrote]))).length, 1);
  const withGate = jl([wrote, { message: { content: [{ type: "tool_use", name: "Bash", input: { command: "node tools/agents/oversee.mjs" } }] } }]);
  assert.equal(checkDoD(collectToolUses(withGate)).length, 0);
});

test("_memory/*.md НЕ тригерва правилото за дефиниции (пише го hook-ът)", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: ".claude/agents/_memory/geymara.md" } }] } },
  ]));
  assert.equal(checkDoD(uses).length, 0);
});

test("писане в 2 продукта → scope-creep нарушение (монорепо закон №1)", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "medqr/server.js" } }] } },
    { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "zabobovdol/src/app/page.tsx" } }] } },
  ]));
  const v = checkDoD(uses);
  assert.ok(v.some((x) => /продукта/.test(x.gate)), JSON.stringify(v));
});

test("инфра + 1 продукт → без scope нарушение", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "medqr/server.js" } }] } },
    { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "tools/agents/oversee.mjs" } }] } },
  ]));
  assert.equal(checkDoD(uses).filter((x) => /продукта/.test(x.gate)).length, 0);
});

// ── Red-team F3 (razbivacha): Bash-запис в файл заобикаляше гейта ──
test("bashWrites лови >, >>, tee, heredoc пренасочвания", () => {
  const w = bashWrites(["cat > resources/shop/server.lua <<EOF", "echo x >> deploy/autodeploy.sh", "cat foo | tee out.txt"]);
  assert.ok(w.includes("resources/shop/server.lua"));
  assert.ok(w.includes("deploy/autodeploy.sh"));
  assert.ok(w.includes("out.txt"));
});

test("F3: .lua създаден през Bash `cat >` без manifest-lint → нарушение", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Bash", input: { command: "cat > resources/shop/server.lua <<'EOF'\nprint('x')\nEOF" } }] } },
  ]));
  const v = checkDoD(uses);
  assert.ok(v.some((x) => /manifest-lint/.test(x.gate)), JSON.stringify(v));
});

test("F1: абсолютни пътища в 2 продукта с root → scope нарушение", () => {
  const root = "/home/user/Few-few";
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", name: "Write", input: { file_path: `${root}/medqr/server.js` } }] } },
    { message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${root}/panev/server.js` } }] } },
  ]));
  assert.ok(checkDoD(uses, root).some((x) => /продукта/.test(x.gate)));
});

test("непарсим ред в транскрипта не чупи събирането", () => {
  const uses = collectToolUses('не е json\n' + JSON.stringify({ message: { content: [{ type: "tool_use", name: "Bash", input: { command: "echo x" } }] } }));
  assert.equal(uses.length, 1);
});
