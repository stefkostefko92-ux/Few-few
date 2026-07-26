import test from "node:test";
import assert from "node:assert/strict";
import {
  STATI_CONTRATTO,
  TRANSIZIONI_CONTRATTO,
  transizioneContrattoAmmessa,
  contrattoModificabile,
  contrattoEliminabile,
  type StatoContratto,
} from "../regole-contratti";

test("таблицата на преходите покрива всяко състояние", () => {
  for (const s of STATI_CONTRATTO)
    assert.ok(TRANSIZIONI_CONTRATTO[s], `липсва ${s}`);
});

test("прекратеният договор е финален — не се съживява", () => {
  for (const a of STATI_CONTRATTO)
    assert.equal(
      transizioneContrattoAmmessa("DISDETTO", a),
      false,
      `DISDETTO → ${a}`,
    );
});

test("изтеклият може да се поднови ръчно", () => {
  assert.equal(transizioneContrattoAmmessa("SCADUTO", "ATTIVO"), true);
  assert.equal(transizioneContrattoAmmessa("SCADUTO", "SOSPESO"), false);
});

test("активният не се връща в чернова", () => {
  assert.equal(transizioneContrattoAmmessa("ATTIVO", "BOZZA"), false);
  assert.equal(transizioneContrattoAmmessa("SOSPESO", "BOZZA"), false);
});

test("спреният не изтича директно — това минава през автоматизма", () => {
  // Автоматизмът гледа само ATTIVO; спрян договор, който „изтича", би останал
  // невидим за него и без следа за прехода.
  assert.equal(transizioneContrattoAmmessa("SOSPESO", "SCADUTO"), false);
});

test("активният договор не се променя свободно", () => {
  // Вече е родил ордини и фактури: смяна на canone под тях прави издадените
  // документи необясними при проверка.
  assert.equal(contrattoModificabile("ATTIVO"), false);
  assert.equal(contrattoModificabile("SCADUTO"), false);
  assert.equal(contrattoModificabile("BOZZA"), true);
  assert.equal(contrattoModificabile("SOSPESO"), true);
});

test("договор с история не се трие — прекратява се", () => {
  assert.equal(contrattoEliminabile("BOZZA", 0), true);
  assert.equal(contrattoEliminabile("BOZZA", 1), false);
  assert.equal(contrattoEliminabile("ATTIVO", 0), false);
});

test("всеки преход води към валидно състояние", () => {
  const validi = new Set<string>(STATI_CONTRATTO);
  for (const s of STATI_CONTRATTO)
    for (const a of TRANSIZIONI_CONTRATTO[s as StatoContratto])
      assert.ok(validi.has(a), `${s} → ${a} не е валидно състояние`);
});
