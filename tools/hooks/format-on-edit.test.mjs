// format-on-edit.test.mjs — PostToolUse: prettier на продукта върху току-що редактирания файл (Boris Cherny, 02.01.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatPlan } from "../../.claude/hooks/format-on-edit.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "hooks", "format-on-edit.mjs");

function fixture({ bin = "ok" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fmt-"));
  const p = join(root, "medqr");
  mkdirSync(join(p, "src"), { recursive: true });
  mkdirSync(join(p, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(p, ".prettierrc.json"), "{}\n");
  writeFileSync(join(p, "src", "a.js"), "const   a=1\n");
  writeFileSync(join(p, "src", "notes.md"), "# x\n");
  writeFileSync(join(p, "package-lock.json"), "{}\n");
  const script = bin === "ok"
    ? "#!/bin/sh\nfor f in \"$@\"; do case \"$f\" in -*) ;; *) printf 'formatted\\n' > \"$f\";; esac; done\n"
    : "#!/bin/sh\nexit 1\n";
  writeFileSync(join(p, "node_modules", ".bin", "prettier"), script);
  chmodSync(join(p, "node_modules", ".bin", "prettier"), 0o755);
  mkdirSync(join(root, "kebab"), { recursive: true });
  writeFileSync(join(root, "kebab", "app.js"), "x\n"); // продукт без prettier
  mkdirSync(join(root, "tools"), { recursive: true });
  writeFileSync(join(root, "tools", "t.mjs"), "x\n");
  return root;
}

const runHook = (root, file, tool = "Edit") => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: tool, tool_input: { file_path: file } }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8",
});

test("formatPlan: само кодов файл в продукт с prettier конфиг И локален prettier", () => {
  const root = fixture();
  try {
    const plan = formatPlan(join(root, "medqr", "src", "a.js"), root);
    assert.equal(plan.cwd, join(root, "medqr"));
    assert.equal(plan.bin, join(root, "medqr", "node_modules", ".bin", "prettier"));
    for (const f of [
      join(root, "medqr", "src", "notes.md"), // документация — не се пипа
      join(root, "medqr", "package-lock.json"), // lock файл
      join(root, "medqr", "node_modules", "x", "i.js"),
      join(root, "kebab", "app.js"), // без prettier
      join(root, "tools", "t.mjs"), // не е продукт с конфиг
      join(root, "..", "elsewhere.js"), // извън репото
      "", null,
    ]) assert.equal(formatPlan(f, root), null, `не бива: ${f}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("symlink от продукта към файл извън него → не се форматира", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "outside.js"), "const   x=1\n");
    symlinkSync(join(root, "outside.js"), join(root, "medqr", "src", "link.js"));
    assert.equal(formatPlan(join(root, "medqr", "src", "link.js"), root), null);
    runHook(root, join(root, "medqr", "src", "link.js"));
    assert.equal(readFileSync(join(root, "outside.js"), "utf8"), "const   x=1\n", "целта извън продукта е непокътната");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("куката форматира редактирания файл; Write и MultiEdit също; Read — не", () => {
  const root = fixture();
  try {
    const f = join(root, "medqr", "src", "a.js");
    assert.equal(runHook(root, f).status, 0);
    assert.equal(readFileSync(f, "utf8"), "formatted\n");
    writeFileSync(f, "raw\n");
    assert.equal(runHook(root, f, "Read").status, 0);
    assert.equal(readFileSync(f, "utf8"), "raw\n", "Read не пипа");
    runHook(root, f, "MultiEdit");
    assert.equal(readFileSync(f, "utf8"), "formatted\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("prettier пада → куката пропуска тихо (изход 0, файлът е непокътнат)", () => {
  const root = fixture({ bin: "fail" });
  try {
    const f = join(root, "medqr", "src", "a.js");
    const r = runHook(root, f);
    assert.equal(r.status, 0);
    assert.equal(readFileSync(f, "utf8"), "const   a=1\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("регистрирана в settings.json за Write|Edit|MultiEdit, с таймаут", () => {
  const s = JSON.parse(readFileSync(join(dirname(HOOK), "..", "settings.json"), "utf8"));
  const hit = s.hooks.PostToolUse.find((g) => g.hooks.some((h) => h.command.includes("format-on-edit.mjs")));
  assert.ok(hit, "куката не е регистрирана");
  assert.match(hit.matcher, /Write/);
  assert.match(hit.matcher, /Edit/);
  assert.ok(hit.hooks.find((h) => h.command.includes("format-on-edit.mjs")).timeout <= 30);
});
