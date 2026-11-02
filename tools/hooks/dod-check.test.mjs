// dod-check.test.mjs — DoD-enforcement hook логиката (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectToolUses, checkDoD, bashWrites, lastAssistantText, checkHandoffViolation, checkFailedGates, collectToolResults } from "../../.claude/hooks/dod-check.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

// --- Договорът ПРЕДАВАНЕ, наложен на SubagentStop ---------------------------------
// Доктрината иска блока от всеки агент при всеки старт (плаща се ~3.8k т/вълна, за да бъде
// инжектиран), а куката не го проверяваше. Агент можеше да завърши със свободен текст и веригата
// тихо се късаше: следващият получаваше проза вместо структура с `файл:ред`.

const AGENTS = new Set(["kodadjiyata", "izpitatelya"]);
const asst = (text) => JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text }] } });

const GOOD = `## ПРЕДАВАНЕ
От: kodadjiyata → Към: izpitatelya
Статус: наред
Изход/артефакт: ревю на diff-а
Следваща стъпка: Изпитателят пуска e2e`;

test("lastAssistantText: взема ПОСЛЕДНИЯ асистентски текст, не първия", () => {
  const jl = [asst("първо"), JSON.stringify({ message: { role: "user", content: "нещо" } }), asst("последно")].join("\n");
  assert.equal(lastAssistantText(jl), "последно");
});

test("lastAssistantText: фоновият агент приключва със SubagentHandback — неговото съобщение е отговорът", () => {
  const handback = JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name: "SubagentHandback", input: { message: GOOD } }] } });
  assert.equal(lastAssistantText([asst("междинно"), handback].join("\n")), GOOD);
  const other = JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { content: "x" } }] } });
  assert.equal(lastAssistantText([asst("последно"), other].join("\n")), "последно");
});

test("lastAssistantText: понася низов content и празен транскрипт", () => {
  assert.equal(lastAssistantText(JSON.stringify({ message: { role: "assistant", content: "гол низ" } })), "гол низ");
  assert.equal(lastAssistantText(""), "");
  assert.equal(lastAssistantText("{счупен"), "");
});

test("валиден блок ПРЕДАВАНЕ → няма нарушение", () => {
  assert.equal(checkHandoffViolation(GOOD, AGENTS), null);
});

test("липсващ блок → нарушение (тук се къса веригата)", () => {
  const v = checkHandoffViolation("Готово, оправих го.", AGENTS);
  assert.ok(v);
  assert.match(v.gate, /ПРЕДАВАНЕ/);
});

test("празен изход НЕ е нарушение — не заклещвай агент без какво да съдиш", () => {
  assert.equal(checkHandoffViolation("", AGENTS), null);
  assert.equal(checkHandoffViolation("   \n ", AGENTS), null);
});

test("адресат извън екипа → нарушение (веригата сочи в нищото)", () => {
  const v = checkHandoffViolation(GOOD.replace("Към: izpitatelya", "Към: несъществуващ"), AGENTS);
  assert.ok(v && /непознат адресат/.test(v.gate));
});

// ── Вълна 2026-07-30: DoD гледа РЕЗУЛТАТА, не само че гейтът е пуснат ─────────────────────────
// Дефектът (от президентския одит, възпроизведен): `collectToolUses` събираше само tool_use
// (име+вход), затова хукът знаеше че гейтът е ПУСНАТ, но не и че е МИНАЛ. Агент можеше да пусне
// гейта, той да падне ЧЕРВЕН, и DoD пак да го пусне за завършено — при положение че доктрината ни
// казва обратното: „готово“ = гейтът е РЕАЛНО зелен, не „предполагам минава“.
// ANSI кодовете се сглобяват в runtime — литерален ESC в изходен файл е невидим и чупи diff-а.
const ESC = String.fromCharCode(27);
const RED = `${ESC}[31m`, GRN = `${ESC}[32m`, RST = `${ESC}[0m`;

test("checkFailedGates: ЧЕРВЕН гейт в резултатите блокира завършването", () => {
  const v = checkFailedGates([`${RED}СТАТУС: ГЕЙТЪТ Е ЧЕРВЕН${RST} — 1 задължителни проверки паднаха: oversee`]);
  assert.ok(v, "червеният гейт трябва да е нарушение");
  assert.match(v.gate, /ЧЕРВЕН/);
  assert.match(v.gate, /гейтът на агентския слой/);
});

test("checkFailedGates: зелено навсякъде → нула нарушения", () => {
  assert.equal(checkFailedGates([`${GRN}СТАТУС: гейтът е зелен${RST} — всички задължителни проверки минаха`]), null);
  assert.equal(checkFailedGates(["# tests 502", "# pass 502", "# fail 0"]), null);
  // Регресия за собствен FP: първият ми маркер за провал търсеше „изтекл" и съвпадаше с този
  // ЗЕЛЕН ред („нула изтекли тайни“) → DoD блокираше при чист secret-scan.
  assert.equal(checkFailedGates(["✓ secret-scan: чисто — нула изтекли тайни в проследените файлове."]), null);
  assert.equal(checkFailedGates([]), null, "празен транскрипт не е нарушение");
});

test("secret-scan: РЕАЛНИЯТ ред на провала блокира", () => {
  assert.ok(checkFailedGates(["✘ secret-scan: 3 възможни тайни — НЕ комитвай/мерджвай:"]));
});

test("ПОСЛЕДНОТО срещане решава — червено→поправка→зелено е ПРАВИЛНИЯТ поток", () => {
  const red = "СТАТУС: ГЕЙТЪТ Е ЧЕРВЕН — 1 задължителни проверки паднаха: oversee";
  const green = "СТАТУС: гейтът е зелен — всички задължителни проверки минаха";
  assert.equal(checkFailedGates([red, "поправих причината", green]), null, "поправеният гейт не блокира");
  assert.ok(checkFailedGates([green, red]), "зелено, после червено = червено");
});

test("паднали ТЕСТОВЕ също блокират (# fail ≠ 0)", () => {
  assert.ok(checkFailedGates(["# tests 10", "# pass 9", "# fail 1"]));
  assert.equal(checkFailedGates(["# fail 0"]), null);
});

test("collectToolResults изважда текста на tool_result (вкл. вложени блокове)", () => {
  const jsonl = [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "node gate.mjs" } }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "СТАТУС: ГЕЙТЪТ Е ЧЕРВЕН" }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: "# fail 0" }] }] } }),
  ].join("\n");
  const res = collectToolResults(jsonl);
  assert.equal(res.length, 2);
  assert.match(res[0], /ЧЕРВЕН/);
  assert.equal(res[1], "# fail 0");
  assert.ok(checkFailedGates(res), "прочетеният червен резултат трябва да блокира");
});

// ── Кръг 11 (2026-08-04): веригата се пише от РАБОТАТА, не от дисциплина ────────────────────────
// `_flows.jsonl` е ground truth за пътя на оркестрацията, но се пълнеше САМО ако Президентът се
// сети да извика `flow-ledger.mjs` — дисциплина, не механизъм. Затова стоеше празен седмици и
// trajectory гейтът нямаше какво да съди („празно значи НЕИЗМЕРЕНО, не чисто" — CLAUDE.md).
// Куката вече валидира блока ПРЕДАВАНЕ на всеки SubagentStop, значи ИМА данните — сега ги записва.
test("appendHandoffToLedger: валиден ПРЕДАВАНЕ блок → запис; без блок → нищо", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-"));
  try {
    const mem = join(dir, ".claude", "agents", "_memory");
    mkdirSync(mem, { recursive: true });
    writeFileSync(join(mem, "_flows.jsonl"), "");
    const good = "Готово.\n\n## ПРЕДАВАНЕ\n- От: izpitatelya\n- Към: kodadjiyata\n- Статус: наред\n"
      + "- Находки: няма\n- Изход/артефакт: tools/x.test.mjs\n- Следваща стъпка: преглед\n";
    const run = (text) => spawnSync(process.execPath, ["-e",
      `import(${JSON.stringify(join(ROOT, ".claude/hooks/dod-check.mjs"))}).then(m=>console.log(m.appendHandoffToLedger(${JSON.stringify(text)},{agent_type:"izpitatelya"})))`],
      { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    assert.match(run(good).stdout, /true/, "валидният блок трябва да се запише");
    assert.match(run("Просто текст без блок").stdout, /false/, "без блок — нищо");
    const lines = readFileSync(join(mem, "_flows.jsonl"), "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 1, "точно един запис");
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.t, "handoff");
    assert.equal(rec.from, "izpitatelya");
    assert.equal(rec.to, "kodadjiyata");
    // Форматът трябва да СЪВПАДА с flow-ledger.mjs — иначе имаме два несъвместими писача.
    for (const k of ["t", "ts", "id", "from", "to", "status"]) assert.ok(k in rec, `липсва поле ${k}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Разбивача, мисия 4: релативни Bash записи от /tmp (B/, L/) не са продукти; реална папка в корена — е", () => {
  const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const bash = (command) => ({ name: "Bash", input: { command } });
  const phantom = checkDoD([bash("cd /tmp/rb4/zbd && echo x > B/a && echo y > L/b && echo z > bin-up2/c")], ROOT_DIR);
  assert.ok(!phantom.some((v) => /СПРИ — пишеш/.test(v.gate)), JSON.stringify(phantom));
  const real = checkDoD([bash("echo x > medqr/a.txt && echo y > treydar/b.txt")], ROOT_DIR);
  assert.ok(real.some((v) => /СПРИ — пишеш в 2 продукта/.test(v.gate)), JSON.stringify(real));
});

test("нарушен блок ПРЕДАВАНЕ връща агента с искане за ЦЕЛИЯ отговор, не само за блока", async () => {
  const { violationMessage } = await import("../../.claude/hooks/dod-check.mjs");
  const v = checkHandoffViolation("Готово, оправих го.", AGENTS);
  assert.equal(v.kind, "handoff");
  const msg = violationMessage(v);
  assert.match(msg, /ЦЕЛИЯ си отговор/);
  assert.match(msg, /Изход\/артефакт:/);
  assert.doesNotMatch(msg, /DoD гейт НЕ е пуснат/, "не бива да праща агента да „пуска гейт“");
});

// Пълната оценка 27.10.2026: Геймъра, записите отказани от правата → куката искаше manifest-lint за
// несъществуващи файлове, агентът отговори само на връщането и ресурсът се изгуби.
test("отказан Write (tool_result is_error) не е запис → няма връщане за гейт", () => {
  const uses = collectToolUses(jl([
    { message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "fivem-resources/cs_shop/server/main.lua" } }] } },
    { message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "Permission to use Write has been denied." }] } },
    { message: { content: [{ type: "tool_use", id: "t2", name: "Write", input: { file_path: "resources/shop/server.lua" } }] } },
    { message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "File created successfully" }] } },
  ]));
  assert.deepEqual(uses.filter((u) => u.name === "Write").map((u) => u.input.file_path), ["resources/shop/server.lua"]);
});

test("всяко връщане (не само за ПРЕДАВАНЕ) иска целия отговор наново", async () => {
  const { REPEAT_ALL } = await import("../../.claude/hooks/dod-check.mjs");
  assert.match(REPEAT_ALL, /ЦЕЛИЯ си отговор/);
  assert.match(REPEAT_ALL, /предишното ми съобщение/);
});

// Регресии 2026-11-02 (Продавача, linketto TDD): (1) показан код на куката (grep) съвпадаше с маркера на
// червения гейт — фалшиво червено, което никога не се изчиства; (2) умишлено червен TDD ран вътре в
// еднократна мутираща команда не се изчистваше от по-късно зелено `npm test` в същия продукт.
test("checkFailedGates: показан код на куката не е червен гейт", () => {
  const grep = `103:  { name: "гейтът на агентския слой", green: /СТАТУС: гейтът е зелен/, red: /СТАТУС: ГЕЙТЪТ Е ЧЕРВЕН/ },\n104:  { name: "oversee", red: /СТАТУС: има твърди проблеми/ },`;
  assert.equal(checkFailedGates([{ cmd: `grep -n "ЧЕРВЕН" .claude/hooks/dod-check.mjs`, out: grep }]), null);
  assert.ok(checkFailedGates([{ cmd: "node tools/agents/gate.mjs", out: `\n\x1b[31mСТАТУС: ГЕЙТЪТ Е ЧЕРВЕН\x1b[0m — 1 паднаха` }]), "истинският червен гейт хапе");
});

test("checkFailedGates: червен TDD ран в heredoc се изчиства от зелено npm test в същия продукт, не в друг", () => {
  const red = { cmd: "python3 - <<'PY'\nopen('t.ts','a').write('x')\nPY\ncd /home/user/Few-few/linketto && npm test 2>&1 | tail -15", out: "# tests 1\n# fail 1" };
  const greenSame = { cmd: "cd linketto && npm test 2>&1 | grep -E '^# '", out: "# tests 224\n# fail 0" };
  const greenOther = { cmd: "cd medqr && npm test", out: "# fail 0" };
  assert.equal(checkFailedGates([red, greenSame]), null);
  assert.ok(checkFailedGates([red, greenOther]), "зелено в друг продукт не изчиства");
  const a = { cmd: "node --test a.test.mjs", out: "# fail 2" }, b = { cmd: "node --test b.test.mjs", out: "# fail 0" };
  assert.ok(checkFailedGates([a, b]), "друг тестов файл пак не маскира червения");
});

// Регресия 2026-11-02 (Геймъра, Кодаджията): нарочно червена мутационна проба във временно копие
// (/tmp, scratchpad) заключваше куката — там зелено не идва. Червено в репото пак хапе.
test("checkFailedGates: червено във временно копие не е гейт; червено в репото пак хапе", () => {
  const mut = { cmd: "cd /tmp/claude-0/x/scratchpad/mut && node --test tools/fivem/stream-lint.test.mjs", out: "# fail 4" };
  const mut2 = { cmd: "node --test /tmp/copy/tools/fivem/stream-lint.test.mjs", out: "# fail 2" };
  assert.equal(checkFailedGates([mut, mut2]), null);
  const repo = { cmd: "cd /home/user/Few-few && node --test tools/fivem/stream-lint.test.mjs", out: "# fail 1" };
  assert.ok(checkFailedGates([mut, repo]), "червено в репото не се маскира");
  assert.ok(checkFailedGates([repo, { cmd: "cd /tmp/copy && node --test tools/fivem/stream-lint.test.mjs", out: "# fail 0" }]), "зелено в копие не изчиства червено в репото");
});
