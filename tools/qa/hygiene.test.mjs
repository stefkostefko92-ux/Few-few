// hygiene.test.mjs — седмичният доклад за чистотата: дълг, дубли, големи файлове, продукти.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDebt, normalize, duplicateBlocks, productReport, productsOf, BLOCK, BIG } from "./hygiene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const body = (tag) => Array.from({ length: BLOCK + 2 }, (_, i) => `  const ${tag}${i} = compute(${i}, "x");`).join("\n");

test("дълг: маркер в коментар — да; в низ или идентификатор — не", () => {
  assert.equal(isDebt("// TODO(owner): перк за гласувалия"), true);
  assert.equal(isDebt("  /* FIXME счупено */"), true);
  assert.equal(isDebt("   * HACK: заобикаляне"), true);
  assert.equal(isDebt('  "hint": "Cuenta los tickets en TODO el servidor."'), false, "испански низ");
  assert.equal(isDebt("const TODOS = [];"), false);
});

test("нормализация: празно, скоби, import и коментари не се броят", () => {
  for (const l of ["", "  }", "});", 'import x from "y";', 'export { a } from "./a";', "// коментар"]) assert.equal(normalize(l), "", l);
  assert.equal(normalize("  return   a +  b;"), "return a + b;");
});

test("дубли: един блок между два файла се отчита веднъж, с двете места; различното не", () => {
  const a = `function a() {\n${body("v")}\n}\n`;
  const b = `// друг файл\n\nfunction b() {\n${body("v")}\n}\n`;
  const c = `function c() {\n${body("w")}\n}\n`;
  const d = duplicateBlocks([{ path: "p/a.ts", text: a }, { path: "p/b.ts", text: b }, { path: "p/c.ts", text: c }]);
  assert.equal(d.length, 1, JSON.stringify(d));
  assert.equal(d[0].lines, BLOCK + 2);
  assert.deepEqual(d[0].at, ["p/a.ts:2", "p/b.ts:4"]);
  assert.deepEqual(duplicateBlocks([{ path: "p/a.ts", text: a.slice(0, 120) }, { path: "p/c.ts", text: c }]), []);
});

test("отчет: тестове, големи и генерирано отделно", () => {
  const big = Array.from({ length: BIG + 5 }, (_, i) => `x${i}();`).join("\n");
  const r = productReport([
    { path: "p/src/a.ts", text: "// TODO: x\nconst a = 1;\n" },
    { path: "p/src/a.test.ts", text: "test()\n" },
    { path: "p/src/big.ts", text: big },
    { path: "p/dist/bundle.js", text: big }, { path: "p/public/vendor.min.js", text: big },
    { path: "p/README.md", text: "TODO" },
  ]);
  assert.equal(r.files, 2);
  assert.equal(r.tests, 1);
  assert.equal(r.debt, 1);
  assert.deepEqual(r.debtAt, ["p/src/a.ts:1"]);
  assert.equal(r.big, 1, "билдът и минифицираното не са „големи“ наши файлове");
});

test("продукт = папка със собствен CLAUDE.md (SupremeDiscordBot няма package.json в корена)", () => {
  assert.deepEqual(productsOf(["SupremeDiscordBot/CLAUDE.md", "SupremeDiscordBot/backend/package.json", "tools/agents/CLAUDE.md", ".claude/x/CLAUDE.md", "CLAUDE.md", "medqr/CLAUDE.md"]),
    ["SupremeDiscordBot", "medqr"]);
});

test("CLI върху git репо: само следени файлове, изход 0, редът за продукта", () => {
  const root = mkdtempSync(join(tmpdir(), "hyg-"));
  try {
    mkdirSync(join(root, "prod", "src"), { recursive: true });
    mkdirSync(join(root, "prod", "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "prod", "CLAUDE.md"), "# p\n");
    writeFileSync(join(root, "prod", "src", "a.js"), `// FIXME: x\n${body("v")}\n`);
    writeFileSync(join(root, "prod", "src", "b.js"), `${body("v")}\n`);
    writeFileSync(join(root, "prod", "node_modules", "x", "i.js"), "// TODO\n");
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("init", "-q"); git("add", ".");
    const r = spawnSync(process.execPath, [join(HERE, "hygiene.mjs"), "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, HYGIENE_ROOT: root } });
    assert.equal(r.status, 0, r.stderr);
    const rows = JSON.parse(r.stdout);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].product, "prod");
    assert.equal(rows[0].debt, 1, "node_modules не се брои");
    assert.equal(rows[0].dups, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
