// hygiene.test.mjs — седмичният доклад за чистотата: дълг, дубли, големи файлове, продукти.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDebt, normalize, duplicateBlocks, productReport, productsOf, isGenerated, isHygieneTest, staticGated, BLOCK, BIG } from "./hygiene.mjs";

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
    // Един различен ред: иначе двата файла са цяло огледало (21.11.2026), не дубъл на блок.
    writeFileSync(join(root, "prod", "src", "b.js"), `${body("v")}\nconst onlyHere = 1;\n`);
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

// ─── Термометърът не лъже (21.11.2026) ─────────────────────────────────────────────────────────────
// Седмичният преглед сложи на върха adblock (1 160 „дублирани“ реда) и SupremeDiscordBot (1 754). И двете
// бяха шум: генериран бандъл с „DO NOT EDIT“ и огледала в отделни Docker контексти, пазени от тест байт по
// байт. А „0 тестове“ лъжеше за SupremeBot (tools/*-test.mjs), cs-revolution (*.test.php) и статичните.

test("генериран файл: „GENERATED … DO NOT EDIT“ или @generated в началото — да; споменаване по-долу — не", () => {
  assert.equal(isGenerated("// GENERATED by tools/build_scriptlets.mjs from scriptlets/list.txt — DO NOT EDIT.\nconst a = 1;"), true);
  assert.equal(isGenerated("/* eslint-disable */\n// @generated by prisma\nx();"), true);
  assert.equal(isGenerated("// Generated file. Do not edit by hand.\nx();"), true);
  assert.equal(isGenerated("const a = 1;\n".repeat(6) + "// GENERATED — DO NOT EDIT\n"), false, "само първите 5 реда");
  assert.equal(isGenerated("// generated thumbnails are cached\nx();"), false, "без „do not edit“ не е генериран");
});

test("отчет: генерираният файл не е дубъл, не е голям и не е наш код — брои се отделно", () => {
  const engine = `function engine() {\n${body("v")}\n}\n`;
  const bundle = `// GENERATED by tools/build.mjs — DO NOT EDIT.\n${engine}${Array.from({ length: BIG }, (_, i) => `y${i}();`).join("\n")}`;
  const r = productReport([{ path: "p/scriptlets/engine.js", text: engine }, { path: "p/scriptlets/main.js", text: bundle }]);
  assert.equal(r.files, 1);
  assert.equal(r.generated, 1);
  assert.equal(r.dups, 0, JSON.stringify(r.dupAt));
  assert.equal(r.big, 0);
});

test("огледала: цели еднакви файлове не са дубли; под тест, когато тест назовава копията", () => {
  const cat = `// каталог\nexport const CATALOG = [\n${body("c")}\n];\n`;
  const parity = `const a = read("../utils/catalog.js");\nconst b = read("../../../backend/src/data/catalog.js");\nconst c = read("../../../frontend/src/data/catalog.js");\nexpect(a).toBe(b);\n`;
  const files = [
    { path: "p/bot/src/utils/catalog.js", text: cat },
    { path: "p/backend/src/data/catalog.js", text: cat },
    { path: "p/frontend/src/data/catalog.js", text: cat },
  ];
  const r = productReport([...files, { path: "p/bot/src/__tests__/catalog.test.js", text: parity }]);
  assert.equal(r.dups, 0, JSON.stringify(r.dupAt));
  assert.equal(r.mirrors, 1);
  assert.equal(r.mirrorsUnguarded, 0);
  assert.equal(r.mirrorAt[0].guarded, true);
  assert.equal(r.mirrorAt[0].at.length, 3);
  assert.equal(r.files, 3, "копията остават наши файлове");

  const bare = productReport(files);
  assert.equal(bare.mirrors, 1);
  assert.equal(bare.mirrorsUnguarded, 1, "огледало без тест за паритет е сигнал: там дрейфът е реален");
  assert.equal(bare.mirrorAt[0].guarded, false);
  assert.equal(bare.dupAt.length, 0, "огледалото не се брои втори път като блок");
  assert.equal(bare.dups, 1, "огледало без тест влиза в заглавното число (ревю 21.11): то е сигналът");
  assert.ok(bare.dupLines >= BLOCK, "и редовете му");
});

test("огледала: тест, който назовава папката (речниците по език), ги пази; папка от 2 нива — не", () => {
  const dict = `export default {\n${body("d")}\n};\n`;
  const loop = `for (const f of ["bg", "de"]) {\n  const web = read(join(HERE, "../../../frontend/src/i18n/catalog", \`\${f}.js\`));\n}\n`;
  const files = [
    { path: "p/bot/src/utils/catalogL10n/bg.js", text: dict },
    { path: "p/frontend/src/i18n/catalog/bg.js", text: dict },
  ];
  assert.equal(productReport([...files, { path: "p/bot/src/__tests__/l10n.test.js", text: loop }]).mirrorsUnguarded, 0);
  const generic = `const x = "src/i18n"; // "bg"\n`;
  assert.equal(productReport([...files, { path: "p/bot/src/__tests__/other.test.js", text: generic }]).mirrorsUnguarded, 1);
});

test("огледало до истински дубъл: общият блок с трети, различен файл се брои веднъж", () => {
  const shared = `function helper() {\n${body("h")}\n}\n`;
  const r = productReport([
    { path: "p/a/x.js", text: shared },
    { path: "p/b/x.js", text: shared },
    { path: "p/c/other.js", text: `// друго\nconst z = 2;\n${shared}` },
  ]);
  assert.equal(r.mirrors, 1);
  assert.equal(r.dupAt.length, 1, JSON.stringify(r.dupAt));
  assert.equal(r.dups, 2, "един блок + едно огледало без тест");
});

test("тестове: *-test.mjs, selftest.mjs и *.test.php се броят; инструмент с „test“ в средата — не", () => {
  for (const p of ["p/tools/engine-test.mjs", "p/tools/api_test.js", "p/tools/selftest.mjs", "p/tests/admin-auth.test.php", "p/tests/LoginTest.php", "p/src/a.test.ts", "p/src/__tests__/b.js"]) assert.equal(isHygieneTest(p), true, p);
  for (const p of ["p/tools/test-data-builder.mjs", "p/src/contest.js", "p/src/latest.ts", "p/tools/test.sh"]) assert.equal(isHygieneTest(p), false, p);
  const r = productReport([
    { path: "p/src/engine.js", text: "x();\n" },
    { path: "p/tools/engine-test.mjs", text: "t();\n" },
    { path: "p/tests/admin-auth.test.php", text: "<?php\n" },
  ]);
  assert.equal(r.files, 1);
  assert.equal(r.tests, 2);
});

test("статичен продукт: CI го пуска през static-site-check → не „0 тестове“", () => {
  const wf = { ".github/workflows/kebab.yml": "      - run: node tools/qa/static-site-check.mjs kebab\n", ".github/workflows/x.yml": "run: node tools/qa/static-site-check.mjs kebabish\n" };
  assert.equal(staticGated("kebab", wf), true);
  assert.equal(staticGated("keb", wf), false, "по цяла дума");
  assert.equal(staticGated("medqr", wf), false);
  assert.equal(productReport([{ path: "kebab/js/a.js", text: "x();\n" }], { staticGate: true }).static, true);
});

test("CLI: статичният продукт се отпечатва като „статичен“, огледалата — в своя колона", () => {
  const root = mkdtempSync(join(tmpdir(), "hyg-"));
  try {
    const w = (p, t) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); };
    w("site/CLAUDE.md", "# s\n"); w("site/js/a.js", "x();\n");
    w(".github/workflows/site.yml", "run: node tools/qa/static-site-check.mjs site\n");
    w("app/CLAUDE.md", "# a\n");
    const cat = `export const C = [\n${body("c")}\n];\n`;
    w("app/a/cat.js", cat); w("app/b/cat.js", cat);
    const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("init", "-q"); git("add", ".");
    const env = { ...process.env, HYGIENE_ROOT: root };
    const j = spawnSync(process.execPath, [join(HERE, "hygiene.mjs"), "--json"], { cwd: root, encoding: "utf8", env });
    assert.equal(j.status, 0, j.stderr);
    const rows = Object.fromEntries(JSON.parse(j.stdout).map((x) => [x.product, x]));
    assert.equal(rows.site.static, true);
    assert.equal(rows.app.mirrors, 1);
    assert.equal(rows.app.mirrorsUnguarded, 1);
    const t = spawnSync(process.execPath, [join(HERE, "hygiene.mjs")], { cwd: root, encoding: "utf8", env });
    assert.match(t.stdout, /огледала/);
    assert.match(t.stdout, /site\s.*статичен/);
    assert.match(t.stdout, /огледало БЕЗ тест за паритет: app\/a\/cat\.js ↔ app\/b\/cat\.js/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ─── Ревюто на Качествения (21.11.2026): четири грешни отговора на правилата за огледалата ────────────
const fn = `export function run() {\n${Array.from({ length: 12 }, (_, i) => `  doThing${i}(alpha, beta, gamma);`).join("\n")}\n}\n`;

test("A: тест до собственото си копие НЕ пази двойката — паритетът иска поглед към другото копие", () => {
  const r = productReport([{ path: "p/web/src/lib/fmt.js", text: fn }, { path: "p/api/fmt.js", text: fn },
    { path: "p/web/src/lib/fmt.test.js", text: `// fixture: web/src/lib/fmt.js\nimport {run} from "./fmt.js"; test("x",()=>run());\n` }]);
  assert.equal(r.mirrorsUnguarded, 1);
});

test("B: кратко име на файл (it, de) не се намира в it( или describe", () => {
  const r = productReport([{ path: "p/a/b/c/it.js", text: fn }, { path: "p/z/it.js", text: fn },
    { path: "p/t/x.test.js", text: `// see a/b/c\nit("works", () => {});\n` }]);
  assert.equal(r.mirrorsUnguarded, 1);
});

test("C: пътят се сравнява по граница — src/util не е src/utils", () => {
  const r = productReport([{ path: "p/src/util.js", text: fn }, { path: "p/web/util.js", text: fn },
    { path: "p/t/y.test.js", text: `read("src/utils/date.js")\n` }]);
  assert.equal(r.mirrorsUnguarded, 1);
});

test("D: различни import-и = различни файлове; огледало значи паритет на суровия текст", () => {
  const r = productReport([{ path: "p/a/repo.js", text: `import { db } from "./pg.js";\n${fn}` }, { path: "p/b/repo.js", text: `import { db } from "./sqlite.js";\n${fn}` }]);
  assert.equal(r.mirrors, 0);
  assert.equal(r.dupAt.length, 1, "общото тяло е истински дубъл");
});

test("многоредов import не е дублиран код (rilievi calcolo-*-libero.ts:5, zabobovdol 9 форми :1)", () => {
  const imp = `import {\n  alpha,\n  beta,\n  gamma,\n  delta,\n  epsilon,\n  zeta,\n  eta,\n  theta,\n  iota,\n} from "./lib.js";\nexport {\n  kappa,\n  lambda,\n} from "./more.js";\n`;
  const r = productReport([{ path: "p/a.js", text: `${imp}const onlyA = 1;\n` }, { path: "p/b.js", text: `${imp}const onlyB = 2;\n` }]);
  assert.equal(r.dups, 0, JSON.stringify(r.dupAt));
});

test("генериран тест не е тест; PHP кодът влиза в знаменателя заедно с PHP теста", () => {
  const r = productReport([
    { path: "p/api/login.php", text: "<?php\n" }, { path: "p/api/admin.php", text: "<?php\n" },
    { path: "p/tests/admin-auth.test.php", text: "<?php\n" },
    { path: "p/gen/schema.test.ts", text: "// @generated by tool\ntest();\n" },
  ]);
  assert.equal(r.tests, 1);
  assert.equal(r.files, 2);
});
