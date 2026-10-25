import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasDotDecimalMoney, toBgMoneyDecimals } from "@/lib/bg-decimals";

test("сумите и курсът — с десетична запетая", () => {
  assert.equal(toBgMoneyDecimals("1 евро = 1.95583 лева"), "1 евро = 1,95583 лева");
  assert.equal(
    toBgMoneyDecimals("Пример: 50 лв ÷ 1.95583 ≈ 25.56 евро."),
    "Пример: 50 лв ÷ 1,95583 ≈ 25,56 евро.",
  );
  assert.equal(toBgMoneyDecimals("по курса (1.95583)."), "по курса (1,95583).");
  assert.equal(toBgMoneyDecimals("1 евро ≈ 1.96 лв"), "1 евро ≈ 1,96 лв");
  assert.equal(toBgMoneyDecimals("цена 12.50 €"), "цена 12,50 €");
});

test("датите, координатите и вече верните суми не се пипат", () => {
  for (const s of ["23.10.2026 г.", "42.36667, 23.00565", "1,95583 лева", "версия 2.10", "0.5 л вода"]) {
    assert.equal(toBgMoneyDecimals(s), s);
    assert.equal(hasDotDecimalMoney(s), false, s);
  }
});

// Пазач: ново съдържание в seed-овете не връща точката (SPEC т. 11).
test("seed-овете нямат суми или курс с десетична точка", () => {
  const dir = join(process.cwd(), "prisma");
  for (const f of readdirSync(dir).filter((n) => /^seed.*\.ts$/.test(n))) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.equal(hasDotDecimalMoney(text), false, `${f}: сума с точка — пишете „1,95583“, „25,56 евро“`);
  }
});
