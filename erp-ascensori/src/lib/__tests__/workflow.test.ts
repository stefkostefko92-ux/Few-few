// Машина на състоянията: таблицата от документацията — дословно.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATI_ORDINE,
  TRANSIZIONI,
  transizioneAmmessa,
  statiFinali,
} from "../workflow";

test("9 статуса, точно по документа", () => {
  assert.equal(STATI_ORDINE.length, 9);
});

test("позволените преходи съвпадат с таблицата", () => {
  assert.deepEqual(TRANSIZIONI.BOZZA, ["EMESSO", "ANNULLATO"]);
  assert.deepEqual(TRANSIZIONI.EMESSO, ["CONFERMATO", "ANNULLATO"]);
  assert.deepEqual(TRANSIZIONI.CONFERMATO, [
    "IN_LAVORO",
    "SOSPESO",
    "ANNULLATO",
  ]);
  assert.deepEqual(TRANSIZIONI.IN_LAVORO, [
    "COMPLETATO",
    "SOSPESO",
    "CONTESTATO",
  ]);
  assert.deepEqual(TRANSIZIONI.SOSPESO, ["IN_LAVORO", "ANNULLATO"]);
  assert.deepEqual(TRANSIZIONI.COMPLETATO, ["CHIUSO", "CONTESTATO"]);
  assert.deepEqual(TRANSIZIONI.CONTESTATO, ["IN_LAVORO", "ANNULLATO"]);
});

test("CHIUSO и ANNULLATO са финални", () => {
  assert.deepEqual(statiFinali().sort(), ["ANNULLATO", "CHIUSO"]);
});

test("непозволен преход се отказва", () => {
  assert.equal(transizioneAmmessa("BOZZA", "COMPLETATO"), false);
  assert.equal(transizioneAmmessa("CHIUSO", "IN_LAVORO"), false);
  assert.equal(transizioneAmmessa("ANNULLATO", "BOZZA"), false);
  assert.equal(transizioneAmmessa("IN_LAVORO", "EMESSO"), false);
});

test("позволен преход минава", () => {
  assert.equal(transizioneAmmessa("BOZZA", "EMESSO"), true);
  assert.equal(transizioneAmmessa("IN_LAVORO", "CONTESTATO"), true);
  assert.equal(transizioneAmmessa("CONTESTATO", "IN_LAVORO"), true);
});
