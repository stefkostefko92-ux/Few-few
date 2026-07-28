// audit-patterns.test.mjs — регресия за ДВА одитора, които веднъж докладваха „чисто", защото
// собственият им разпознавател беше сляп. И двата дефекта минаха незабелязано в реална работа.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestFile, isUnfinished } from "./audit-patterns.mjs";

// --- Изпитателят: колекторът пропускаше e2e файловете ------------------------------
// Преди поправката шаблонът беше `/\.(test|spec)\./` → `webauthn.e2e.mjs` НЕ влизаше в списъка,
// затова нито `.only`, нито flaky-sleep проверката са го отваряли някога, а итогът пишеше „чисто".

test("e2e файловете СЕ броят за тестови (дефектът: бяха сляпо петно)", () => {
  assert.equal(isTestFile("webauthn.e2e.mjs"), true);
  assert.equal(isTestFile("checkout.e2e.ts"), true);
});

test("класическите test/spec файлове продължават да се броят", () => {
  for (const f of ["a.test.mjs", "b.spec.ts", "c.test.tsx", "d.spec.js", "__tests__/jsonld.test.ts"])
    assert.equal(isTestFile(f), true, f);
});

test("НЕ-тестови файлове не се броят (иначе одиторът се дави в шум)", () => {
  for (const f of ["index.mjs", "README.md", "server.ts", "e2e.md", "testing.ts", "spec.json"])
    assert.equal(isTestFile(f), false, f);
});

test("непознато разширение не минава дори с тестово име", () => {
  assert.equal(isTestFile("smoke.e2e.py"), false, "само JS/TS семейството");
  assert.equal(isTestFile("smoke.e2e.sh"), false);
});

// --- Летописецът: `XXX` ловеше примерни имена на файлове ---------------------------
// Преди поправката `/XXX{2,}/i` маркираше `backup-xxxx.sql.gz` в примерна команда като „недовършен
// маркер". Шумът удавяше истинския — незапълнения телефон в правен документ.

test("истинските плейсхолдъри СЕ ловят", () => {
  assert.equal(isUnfinished("Телефон за сигнали: +359 XX XXX XXXX"), true, "незапълнен телефон");
  assert.equal(isUnfinished("- TODO: допиши раздела"), true);
  assert.equal(isUnfinished("TBD преди пускане"), true);
  assert.equal(isUnfinished("Lorem ipsum dolor sit amet"), true);
  assert.equal(isUnfinished("виж <placeholder>"), true);
  assert.equal(isUnfinished("FIXME счупена връзка"), true);
});

test("примерни имена на файлове/аргументи НЕ са находка (фалшивият позитив, който удавяше сигнала)", () => {
  assert.equal(isUnfinished("psql < backup-XXXX.sql.gz"), false, "част от име на файл");
  assert.equal(isUnfinished("releases/few-few-XXXXXXXX/deploy"), false, "част от път");
  assert.equal(isUnfinished("ключ_XXXX се чете от сървъра"), false, "част от идентификатор");
  assert.equal(isUnfinished("виж xxxx в примера"), false, "малки букви = не е плейсхолдър");
});

test("обикновен текст не се маркира", () => {
  for (const l of ["Продуктът е готов за пускане.", "Виж deploy/README.md", ""])
    assert.equal(isUnfinished(l), false, l);
});
