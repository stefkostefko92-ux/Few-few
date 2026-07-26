// Йерархия на 7-те нива: по-ниското число включва правата на по-високото.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RUOLI, LIVELLO, haPermesso, isRuolo, RUOLO_LABEL } from "../roles";

test("7 нива, номерирани 1..7", () => {
  assert.equal(RUOLI.length, 7);
  assert.deepEqual(
    RUOLI.map((r) => LIVELLO[r]),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("ADMIN може всичко на OPERATORE, но не обратно", () => {
  assert.equal(haPermesso("ADMIN", "OPERATORE"), true);
  assert.equal(haPermesso("OPERATORE", "ADMIN"), false);
});

test("MASTER е над всички; CLIENTE — само своето ниво", () => {
  for (const r of RUOLI) assert.equal(haPermesso("MASTER", r), true);
  assert.equal(haPermesso("CLIENTE", "CLIENTE"), true);
  assert.equal(haPermesso("CLIENTE", "TECNICO"), false);
});

test("isRuolo пази от невалидни стойности", () => {
  assert.equal(isRuolo("ADMIN"), true);
  assert.equal(isRuolo("ROOT"), false);
  assert.equal(isRuolo(42), false);
});

test("всяко ниво има италиански етикет", () => {
  // Без етикет интерфейсът показва суровата стойност от базата („RESPONSABILE"),
  // а тя е на нашия вътрешен език, не на клиентския.
  for (const r of RUOLI) assert.ok((RUOLO_LABEL[r] ?? "").length > 0, r);
  assert.equal(Object.keys(RUOLO_LABEL).length, RUOLI.length);
});
