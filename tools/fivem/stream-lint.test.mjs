// stream-lint.test.mjs — node:test за линтера на активи (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lintResource, parseManifest, globToRe, collect, formatTable } from "./stream-lint.mjs";

const MIB = 1024 * 1024;
const MAN = "fx_version 'cerulean'\ngame 'gta5'\n";
const codes = (r) => r.findings.map((f) => f.code);
const f = (rel, size = 1000) => ({ rel, size });

test("файл над предупредителния праг → WARN large; над червения → ERROR oversized", () => {
  const r = lintResource([f("stream/a.ytd", 20 * MIB), f("stream/b.ytd", 70 * MIB), f("stream/c.ytd", 5 * MIB)], MAN);
  assert.ok(r.findings.some((x) => x.code === "large" && x.where === "stream/a.ytd" && x.sev === "WARN"));
  assert.ok(r.findings.some((x) => x.code === "oversized" && x.where === "stream/b.ytd" && x.sev === "ERROR"));
  assert.ok(!r.findings.some((x) => x.where === "stream/c.ytd"));
});

test("праговете са конфигурируеми", () => {
  const r = lintResource([f("stream/a.ytd", 3 * MIB)], MAN, { warnMb: 2, errorMb: 10 });
  assert.ok(codes(r).includes("large"));
});

test("непознато разширение → WARN; работен файл → ERROR", () => {
  const r = lintResource([f("stream/x.abc"), f("stream/y.blend"), f("stream/z.ydr")], MAN);
  assert.ok(r.findings.some((x) => x.code === "unknown-ext" && x.where === "stream/x.abc"));
  assert.ok(r.findings.some((x) => x.code === "work-file" && x.sev === "ERROR"));
  assert.ok(!r.findings.some((x) => x.where === "stream/z.ydr"));
});

test("дублирани имена на активи (различен регистър/подпапка) → ERROR dup-asset", () => {
  const r = lintResource([f("stream/a/Door.ydr"), f("stream/b/door.ydr")], MAN);
  assert.ok(r.findings.some((x) => x.code === "dup-asset" && x.sev === "ERROR"));
});

test("интервал в името → ERROR bad-name", () => {
  const r = lintResource([f("stream/my door.ydr")], MAN);
  assert.ok(codes(r).includes("bad-name"));
});

test("мета файл без data_file → ERROR meta-no-data-file", () => {
  const r = lintResource([f("handling.meta"), f("stream/x.ydr")], MAN);
  assert.ok(r.findings.some((x) => x.code === "meta-no-data-file" && x.sev === "ERROR"));
});

test("мета файл със запис и files → чисто", () => {
  const man = MAN + "files { 'handling.meta' }\ndata_file 'HANDLING_FILE' 'handling.meta'\n";
  const r = lintResource([f("handling.meta")], man);
  assert.deepEqual(codes(r), []);
});

test("data_file към липсващ файл → ERROR; glob намира файла", () => {
  const miss = lintResource([], MAN + "data_file 'HANDLING_FILE' 'nope.meta'\n");
  assert.ok(codes(miss).includes("data-file-missing-file"));
  const ok = lintResource([f("metas/a_handling.meta")], MAN + "files { 'metas/*_handling.meta' }\ndata_file 'HANDLING_FILE' 'metas/*_handling.meta'\n");
  assert.deepEqual(codes(ok), []);
});

test("грешен тип data_file → WARN data-file-type; извън files → WARN not-in-files", () => {
  const r = lintResource([f("carcols.meta")], MAN + "data_file 'HANDLING_FILE' 'carcols.meta'\n");
  assert.ok(codes(r).includes("data-file-type"));
  assert.ok(codes(r).includes("not-in-files"));
});

test("коментиран data_file не се брои", () => {
  const r = lintResource([f("handling.meta")], MAN + "-- data_file 'HANDLING_FILE' 'handling.meta'\n");
  assert.ok(codes(r).includes("meta-no-data-file"));
});

test("ymap/ytyp без this_is_a_map → WARN (няма официален източник за ERROR); със → чисто", () => {
  const bad = lintResource([f("stream/m.ymap"), f("stream/m.ytyp")], MAN);
  assert.ok(bad.findings.some((x) => x.code === "no-this-is-a-map" && x.sev === "WARN"));
  const ok = lintResource([f("stream/m.ymap")], MAN + "this_is_a_map 'yes'\n");
  assert.ok(!codes(ok).includes("no-this-is-a-map"));
});

test("липсва fxmanifest → ERROR no-manifest", () => {
  assert.ok(codes(lintResource([f("stream/a.ydr")], null)).includes("no-manifest"));
});

test("дрехи: правилно име → без находка; лошо име → WARN clothing-name", () => {
  const good = lintResource([f("stream/mp_m_freemode_01_pack^jbib_000_u.ydd"), f("stream/mp_m_freemode_01_pack^jbib_diff_000_a_uni.ytd")], MAN);
  assert.deepEqual(codes(good), []);
  const bad = lintResource([f("stream/jbib_7.ydd")], MAN);
  assert.ok(codes(bad).includes("clothing-name"));
});

test("дрехи: празнина в номерацията и ydd без ytd", () => {
  const r = lintResource([f("stream/jbib_000_u.ydd"), f("stream/jbib_diff_000_a_uni.ytd"), f("stream/jbib_002_u.ydd")], MAN);
  assert.ok(codes(r).includes("clothing-gap"));
  assert.ok(codes(r).includes("clothing-orphan"));
});

test("parseManifest: files блок, file ред, this_is_a_map", () => {
  const m = parseManifest("files { 'a.meta', \"b/*.meta\" }\nfile 'c.meta'\nthis_is_a_map 'yes'\ndata_file 'CARCOLS_FILE' 'a.meta'");
  assert.deepEqual(m.files, ["a.meta", "b/*.meta", "c.meta"]);
  assert.equal(m.thisIsAMap, true);
  assert.deepEqual(m.dataFiles, [{ type: "CARCOLS_FILE", path: "a.meta" }]);
});

test("globToRe: * не пресича директория", () => {
  assert.ok(globToRe("metas/*.meta").test("metas/a.meta"));
  assert.ok(!globToRe("metas/*.meta").test("metas/x/a.meta"));
});

test("CLI: exit 1 при ERROR, 0 при чист ресурс, таблица в изхода", () => {
  const script = fileURLToPath(new URL("./stream-lint.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "slint-"));
  try {
    mkdirSync(join(dir, "stream"));
    writeFileSync(join(dir, "fxmanifest.lua"), MAN);
    writeFileSync(join(dir, "stream", "door.ydr"), "x");
    const ok = spawnSync("node", [script, dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    writeFileSync(join(dir, "stream", "door.blend"), "x");
    const bad = spawnSync("node", [script, dir], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /work-file/);
    assert.match(bad.stdout, /Тежест \| Код/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── регресии от прегледа на Кодаджията ─────────────────────────────────────────────────────────
const SCRIPT = fileURLToPath(new URL("./stream-lint.mjs", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "slint-"));
const cli = (...a) => spawnSync("node", [SCRIPT, ...a], { encoding: "utf8" });

test("БЛОКЕР: скрипт в път с интервал и кирилица пак върви (exit 1 при ERROR, не тих exit 0)", () => {
  const base = tmp();
  try {
    const sd = join(base, "инстр ументи"); mkdirSync(sd);
    const copy = join(sd, "stream-lint.mjs"); copyFileSync(SCRIPT, copy);
    const res = join(base, "res"); mkdirSync(join(res, "stream"), { recursive: true });
    writeFileSync(join(res, "fxmanifest.lua"), MAN); writeFileSync(join(res, "stream", "a.blend"), "x");
    const r = spawnSync("node", [copy, res], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /work-file/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("walk: symlink цикъл не е безкраен; линк навън не се сканира; има WARN symlink", () => {
  const base = tmp();
  try {
    const res = join(base, "res"), outside = join(base, "outside");
    mkdirSync(join(res, "stream"), { recursive: true }); mkdirSync(outside);
    writeFileSync(join(res, "stream", "a.ydr"), "x"); writeFileSync(join(outside, "secret.ydr"), "x");
    symlinkSync("..", join(res, "stream", "up"));
    symlinkSync(outside, join(res, "stream", "ext"));
    const { list, findings } = collect(res, { maxFiles: 1000 });
    assert.deepEqual(list.map((x) => x.rel).sort(), ["stream/a.ydr"]);
    assert.equal(findings.filter((x) => x.code === "symlink" && x.sev === "WARN").length, 2);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("walk: таван на броя файлове → WARN file-cap и спира", () => {
  const base = tmp();
  try {
    mkdirSync(join(base, "stream"));
    for (let i = 0; i < 20; i++) writeFileSync(join(base, "stream", `f${i}.ydr`), "x");
    const { list, findings } = collect(base, { maxFiles: 5 });
    assert.equal(list.length, 5);
    assert.ok(findings.some((x) => x.code === "file-cap" && x.sev === "WARN"));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("регистър: пътят в манифеста е различен по главни/малки → WARN case-mismatch, не фалшив ERROR", () => {
  const man = MAN + "files { 'Handling.meta' }\ndata_file 'HANDLING_FILE' 'Handling.META'\n";
  const r = lintResource([f("handling.meta")], man);
  assert.ok(r.findings.some((x) => x.code === "case-mismatch" && x.sev === "WARN"));
  assert.ok(!r.findings.some((x) => x.sev === "ERROR"));
  const exact = lintResource([f("handling.meta")], MAN + "files { 'handling.meta' }\ndata_file 'HANDLING_FILE' 'handling.meta'\n");
  assert.ok(!exact.findings.some((x) => x.code === "case-mismatch"));
});

test("globToRe е чувствителен към регистър", () => {
  assert.ok(!globToRe("a/B.meta").test("a/b.meta"));
});

test("нечислов/липсващ --error-mb и --warn-mb → exit 2 със съобщение", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "fxmanifest.lua"), MAN);
    for (const args of [["--error-mb", "64MB"], ["--warn-mb", "abc"], ["--error-mb"], ["--warn-mb", "-1"], ["--warn-mb", "50", "--error-mb", "10"]]) {
      const r = cli(d, ...args);
      assert.equal(r.status, 2, args.join(" ") + " → " + r.stdout + r.stderr);
      assert.match(r.stderr, /--(warn|error)-mb/);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("__resource.lua като резерва: WARN legacy-manifest, без ERROR no-manifest", () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "stream")); writeFileSync(join(d, "stream", "a.ydr"), "x");
    writeFileSync(join(d, "__resource.lua"), "resource_manifest_version '44febabe-d386-4d18-afbe-5e627f4af937'\n");
    const r = cli(d);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /legacy-manifest/);
    assert.doesNotMatch(r.stdout, /no-manifest/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("коментар --[==[ ... ]==] се маха; обикновен --[[ ]] също; ред-коментар също", () => {
  assert.deepEqual(parseManifest("--[==[\ndata_file 'HANDLING_FILE' 'a.meta'\n]==]").dataFiles, []);
  assert.deepEqual(parseManifest("--[[\ndata_file 'HANDLING_FILE' 'a.meta'\n]]").dataFiles, []);
  assert.deepEqual(parseManifest("-- data_file 'HANDLING_FILE' 'a.meta'").dataFiles, []);
  assert.equal(parseManifest("--[==[ ]] още коментар ]==] this_is_a_map 'yes'").thisIsAMap, true);
});

test("`--` вътре в низ не е коментар", () => {
  const m = parseManifest("files { 'x--y.meta' }\nclient_script 'c.lua'\nfiles { 'z.meta' }");
  assert.deepEqual(m.files, ["x--y.meta", "z.meta"]);
  assert.deepEqual(parseManifest("data_file 'HANDLING_FILE' 'a--b.meta'").dataFiles, [{ type: "HANDLING_FILE", path: "a--b.meta" }]);
});

test("форми: двойни кавички, скоби, многоредов files с коментар", () => {
  assert.deepEqual(parseManifest('data_file("HANDLING_FILE")("a.meta")').dataFiles, [{ type: "HANDLING_FILE", path: "a.meta" }]);
  assert.deepEqual(parseManifest("files {\n  'a.meta', -- c\n  \"b.meta\"\n}").files, ["a.meta", "b.meta"]);
});

test("this_is_a_map 'no' / false / 0 НЕ е yes", () => {
  for (const v of ["this_is_a_map 'no'", "this_is_a_map 'false'", "this_is_a_map '0'", "this_is_a_map(false)", "this_is_a_map ''"]) assert.equal(parseManifest(v).thisIsAMap, false, v);
  for (const v of ["this_is_a_map 'yes'", "this_is_a_map 'true'", "this_is_a_map(true)", "this_is_a_map"]) assert.equal(parseManifest(v).thisIsAMap, true, v);
  assert.equal(parseManifest("-- this_is_a_map 'yes'").thisIsAMap, false);
});

test("ReDoS: патологични входове се парсват за милисекунди", () => {
  const t = (fn) => { const s = performance.now(); fn(); return performance.now() - s; };
  assert.ok(t(() => parseManifest("data_file" + " ".repeat(20000) + "x")) < 300);
  assert.ok(t(() => parseManifest("data_file 'A'" + " ".repeat(20000) + "x")) < 300);
  assert.ok(t(() => parseManifest("--[[".repeat(20000))) < 300);
  assert.ok(t(() => parseManifest("files {".repeat(20000))) < 300);
  assert.ok(t(() => globToRe("**a".repeat(12) + "b").test("a".repeat(40))) < 300);
});

test("ytyp без DLC_ITYP_REQUEST → INFO ytyp-no-dlc-itypreq; със запис → няма", () => {
  const base = MAN + "this_is_a_map 'yes'\n";
  const a = lintResource([f("stream/m.ytyp")], base);
  assert.ok(a.findings.some((x) => x.code === "ytyp-no-dlc-itypreq" && x.sev === "INFO"));
  const b = lintResource([f("stream/m.ytyp")], base + "data_file 'DLC_ITYP_REQUEST' 'stream/m.ytyp'\n");
  assert.ok(!b.findings.some((x) => x.code === "ytyp-no-dlc-itypreq"));
  assert.ok(!b.findings.some((x) => x.sev !== "INFO"));
});

test("formatTable не реже дълги пътища", () => {
  const long = "stream/" + "a".repeat(90) + "/door.ydr";
  const t = formatTable([{ sev: "WARN", code: "x", where: long, msg: "m" }]);
  assert.ok(t.includes(long));
});

test("правопис: няма думи със смесени кирилица+латиница в сорса", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const bad = (src.match(/[\p{L}]+/gu) || []).filter((w) => /\p{Script=Cyrillic}/u.test(w) && /\p{Script=Latin}/u.test(w));
  assert.deepEqual(bad, []);
});

test("глоб: `meta/**/x` покрива и нула, и много директории; `**` не пресича без /", () => {
  assert.ok(globToRe("meta/**/handling.meta").test("meta/handling.meta"));
  assert.ok(globToRe("meta/**/handling.meta").test("meta/a/b/handling.meta"));
  assert.ok(!globToRe("meta/**/handling.meta").test("metaX/handling.meta"));
  assert.ok(globToRe("a/**").test("a/b/c.meta"));
});

// Повторно ревю на Кодаджията (02.11.2026): пускане през symlink (тих exit 0), [[\n в long string,
// бавен globMatch при много файлове × много data_file.
test("CLI: пускане през symlink не мълчи (stream-lint и manifest-lint)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: j } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const d = mkdtempSync(j(tmpdir(), "sl-link-"));
  try {
    const res = j(d, "res"); mkdirSync(j(res, "stream"), { recursive: true });
    writeFileSync(j(res, "fxmanifest.lua"), "fx_version 'cerulean'\ngame 'gta5'\n");
    writeFileSync(j(res, "stream", "a.blend"), "x");
    for (const name of ["stream-lint.mjs", "manifest-lint.mjs"]) {
      const link = j(d, name);
      symlinkSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), link);
      const r = spawnSync(process.execPath, [link, res], { encoding: "utf8" });
      assert.ok((r.stdout + r.stderr).trim().length > 0, `${name} през symlink мълчи (exit ${r.status})`);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("long string [[ ]]: първият нов ред не влиза в низа (както в Lua)", async () => {
  const { parseManifest } = await import("./stream-lint.mjs");
  const m = parseManifest("data_file 'HANDLING_FILE' [[\nhandling.meta]]\nfiles { [[\r\ncarcols.meta]] }\n");
  assert.equal(m.dataFiles[0].path, "handling.meta");
  assert.deepEqual(m.files, ["carcols.meta"]);
});

test("globMatch: точен шаблон и повтарян шаблон без квадратично време", async () => {
  const { globMatch } = await import("./stream-lint.mjs");
  const files = Array.from({ length: 20000 }, (_, i) => `stream/sub${i % 50}/asset_${i}.ytd`);
  const pats = Array.from({ length: 100 }, (_, i) => `meta/missing_${i}.meta`);
  const t0 = Date.now();
  for (const p of pats) for (const f of files) { globMatch(p, f, false); globMatch(p, f, true); }
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  assert.ok(globMatch("meta/**/x.meta", "meta/x.meta") && globMatch("Meta/X.meta", "meta/x.meta", true) && !globMatch("Meta/X.meta", "meta/x.meta"));
});
