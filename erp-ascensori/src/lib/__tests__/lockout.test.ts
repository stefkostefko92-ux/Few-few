// Блокада при груба сила: 5 опита → 15 минути, нулиране при успех.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eBloccato,
  registraFallimento,
  registraSuccesso,
  MAX_TENTATIVI,
  BLOCCO_MINUTI,
} from "../lockout";

const ORA = new Date("2026-07-25T10:00:00Z");

test("под лимита: брои и връща оставащите", () => {
  const esito = registraFallimento({ tentativi: 0, bloccatoFino: null }, ORA);
  assert.equal(esito.bloccato, false);
  assert.equal(esito.tentativi, 1);
  assert.equal(esito.tentativiRimasti, MAX_TENTATIVI - 1);
});

test("петият пореден неуспех блокира за 15 минути", () => {
  const esito = registraFallimento({ tentativi: 4, bloccatoFino: null }, ORA);
  assert.equal(esito.bloccato, true);
  assert.equal(esito.tentativi, 5);
  assert.equal(esito.bloccatoFino?.getTime(), ORA.getTime() + BLOCCO_MINUTI * 60_000);
});

test("блокадата е активна до изтичане и пада след това", () => {
  const fino = new Date(ORA.getTime() + 5 * 60_000);
  assert.equal(eBloccato({ tentativi: 5, bloccatoFino: fino }, ORA), true);
  assert.equal(
    eBloccato({ tentativi: 5, bloccatoFino: fino }, new Date(fino.getTime() + 1)),
    false
  );
});

test("успешният вход нулира брояча", () => {
  assert.deepEqual(registraSuccesso(), { tentativi: 0, bloccatoFino: null });
});
