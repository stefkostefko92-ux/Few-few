// printability.test.mjs — watertight не значи „правилно ориентиран“ (Принтаджията, 2026-09-24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "printability.mjs");
const V = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]];
// Тетраедър с нормали навън (обем > 0).
const OUT = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];

function stl(faces) {
  const b = Buffer.alloc(84 + faces.length * 50);
  b.writeUInt32LE(faces.length, 80);
  faces.forEach((f, i) => f.forEach((vi, j) => V[vi].forEach((c, k) => b.writeFloatLE(c, 84 + i * 50 + 12 + j * 12 + k * 4))));
  const p = join(mkdtempSync(join(tmpdir(), "stl-")), "m.stl");
  writeFileSync(p, b);
  return spawnSync(process.execPath, [TOOL, p], { encoding: "utf8" });
}

test("затворен, правилно ориентиран тетраедър минава", () => {
  const r = stl(OUT);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Последователен winding: ДА/);
});

test("един обърнат фейс: watertight ДА, но winding НЕ → критично", () => {
  const r = stl([OUT[0], OUT[1], OUT[2], [1, 3, 2]]);
  assert.match(r.stdout, /Watertight \(затворена обвивка\): ДА/);
  assert.match(r.stdout, /Последователен winding: НЕ/);
  assert.equal(r.status, 1);
});

test("цялата мрежа наопаки (отрицателен обем) → критично", () => {
  const r = stl(OUT.map(([a, b, c]) => [a, c, b]));
  assert.match(r.stdout, /НАВЪТРЕ/);
  assert.equal(r.status, 1);
});

test("празен STL (0 триъгълника) → грешка, не „побира се: ДА“", () => {
  const r = stl([]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /Infinity/);
});

test("триъгълник с 3 съвпадащи върха: само degenerate, без фантомни non-manifold/обърнати ръбове", () => {
  const r = stl([...OUT, [0, 0, 0]]);
  assert.doesNotMatch(r.stdout, /Последователен winding: НЕ/, r.stdout);
  assert.match(r.stdout, /Watertight \(затворена обвивка\): ДА/, r.stdout);
});
