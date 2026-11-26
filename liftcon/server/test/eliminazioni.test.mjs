// Списъкът на изтриванията и повторното му прилагане при старт (docs/documenti-spec.md D16а, L6-B): възстановен
// бекъп не връща изтрит документ или заявка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup, creaUtente } from "./helpers.mjs";
import { avviaEliminazioni, registroEliminazioni, riapplicaEliminazioni } from "../dist/eliminazioni.js";
import { archivio } from "../dist/documenti/archivio.js";
import { nuovoDocumento } from "../dist/documenti/condiviso/nuovo.js";

function cartellaConFoto(dataDir, docId) {
  const dir = join(dataDir, "documenti", docId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${randomUUID()}.jpg`), "jpeg");
  return dir;
}

test("повторно прилагане: върнатите от бекъп документ и заявка се трият пак (с файловете и надгробния запис); идемпотентно", async () => {
  const s = await setup();
  try {
    const { u } = await creaUtente(s.store, { sig: s.sig, ruolo: "TECNICO", email: "t@liftcon.it" });
    const id = randomUUID();
    const d = nuovoDocumento("SOPRALLUOGO", id);
    await s.admin.documenti.salva(u, id, { tipo: d.tipo, versione: 0, intestazione: d.intestazione, dati: d.dati, foto: [] });
    assert.ok(await s.store.documenti.perId(id));
    const cartella = cartellaConFoto(s.dataDir, id);
    const rq = await s.store.richieste.crea({ nome: "Anna Verdi", email: "anna@example.com", telefono: "", ruolo: "altro", comune: "Rho", servizio: "altro", messaggio: "x".repeat(20), eliminareDopo: new Date(s.clock.t + 1e9) });
    // Снимка на друга чернова, изтрита след бекъпа (редът и файлът са върнати от бекъпа).
    const altro = randomUUID();
    await s.admin.documenti.salva(u, altro, { tipo: d.tipo, versione: 0, intestazione: d.intestazione, dati: d.dati, foto: [] });
    const fotoId = randomUUID();
    await s.store.foto.crea({ id: fotoId, documentoId: altro, ordine: 1, didascalia: "", ubicazione: "", riferimento: "", larghezza: 10, altezza: 10, byte: 4, sha256: "0".repeat(64) });
    const cartellaAltro = join(s.dataDir, "documenti", altro);
    mkdirSync(cartellaAltro, { recursive: true });
    writeFileSync(join(cartellaAltro, `${fotoId}.jpg`), "jpeg");
    writeFileSync(join(cartellaAltro, `${fotoId}-mini.jpg`), "mini");
    // Изтрити СЛЕД бекъпа: редовете са в списъка, а възстановеният бекъп ги е върнал в базата и на диска.
    await s.admin.eliminazioni.annota({ tipo: "documento", id });
    await s.admin.eliminazioni.annota({ tipo: "richiesta", id: rq.id });
    await s.admin.eliminazioni.annota({ tipo: "foto", id: fotoId, doc: altro });
    // Документ без ред в базата (по-стар дъмп), но с файлове от по-нова моментна снимка.
    const orfano = randomUUID();
    const cartellaOrfano = cartellaConFoto(s.dataDir, orfano);
    await s.admin.eliminazioni.annota({ tipo: "documento", id: orfano });
    await s.admin.eliminazioni.annota({ tipo: "documento", id: orfano }); // двоен ред — без значение
    const deps = { store: s.store, archivio: archivio(s.dataDir), registro: s.admin.eliminazioni };

    assert.deepEqual(await riapplicaEliminazioni(deps), { documenti: 1, richieste: 1, foto: 1, scartate: 0 });
    assert.equal(await s.store.documenti.perId(id), null);
    assert.equal(await s.store.documenti.eliminato(id), true, "надгробен запис: устройство не може да го създаде пак");
    assert.equal(await s.store.documenti.eliminato(orfano), true);
    assert.equal(existsSync(cartella), false);
    assert.equal(existsSync(cartellaOrfano), false);
    assert.equal(await s.store.richieste.perId(rq.id), null);
    assert.equal(await s.store.foto.perId(fotoId), null);
    assert.equal(existsSync(join(cartellaAltro, `${fotoId}.jpg`)), false);
    assert.equal(existsSync(join(cartellaAltro, `${fotoId}-mini.jpg`)), false);
    assert.ok(await s.store.documenti.perId(altro), "документът на снимката остава");

    assert.deepEqual(await riapplicaEliminazioni(deps), { documenti: 0, richieste: 0, foto: 0, scartate: 0 }, "идемпотентно");
  } finally {
    await s.close();
  }
});

test("списъкът: невалидни редове (и път извън папката) се прескачат; липсващ файл = празен списък; липсваща папка → грешка", async () => {
  const dir = mkdtempSync(join(tmpdir(), "liftcon-elim-"));
  const reg = registroEliminazioni(dir, () => Date.UTC(2026, 10, 26, 12, 0, 0));
  await reg.verifica();
  assert.deepEqual(await reg.leggi(), { voci: [], scartate: 0 });
  appendFileSync(
    join(dir, "eliminazioni.jsonl"),
    'non è json\n{"tipo":"documento","id":"../../etc","il":"x"}\n{"tipo":"utente","id":"abc","il":"x"}\n{"tipo":"richiesta","id":"ok1","il":"x","extra":1}\n\n',
  );
  // Прекъснат запис (без нов ред накрая) не слепва следващия ред.
  appendFileSync(join(dir, "eliminazioni.jsonl"), '{"tipo":"richiesta","id":"rotto"');
  await reg.annota({ tipo: "richiesta", id: "ckx1abc" });
  const l = await reg.leggi();
  assert.equal(l.scartate, 5);
  assert.deepEqual(l.voci, [{ tipo: "richiesta", id: "ckx1abc", il: "2026-11-26T12:00:00.000Z" }]);
  await assert.rejects(reg.annota({ tipo: "documento", id: "../x" }), "невалиден id не се записва");
  await assert.rejects(reg.annota({ tipo: "documento", id: "ckx1abc" }), "документът е UUID");
  await assert.rejects(reg.annota({ tipo: "foto", id: randomUUID(), doc: "../x" }), "и документът на снимката е UUID");
  const manca = registroEliminazioni(join(dir, "manca"));
  await assert.rejects(manca.verifica());
  await assert.rejects(manca.annota({ tipo: "richiesta", id: "abc" }));
});

test("старт: липсващ списък без следи от изтривания → създава се празен; със следи (надгробен запис или събитие) → не тръгва", async () => {
  const s = await setup();
  try {
    const deps = () => ({ store: s.store, archivio: archivio(s.dataDir), registro: registroEliminazioni(s.elimDir) });
    const file = join(s.elimDir, "eliminazioni.jsonl");
    assert.deepEqual(await avviaEliminazioni(deps()), { documenti: 0, richieste: 0, foto: 0, scartate: 0 });
    assert.equal(readFileSync(file, "utf8"), "", "първи старт: празен файл");
    assert.equal((statSync(file).mode & 0o777).toString(8), "600");

    // Изгубен списък при база със събитие за изтрита заявка → старт не става.
    const s2 = await setup();
    try {
      await s2.store.eventi.registra({ utenteId: null, azione: "richiesta.eliminata", oggetto: "abc", dettagli: null, ipHmac: null });
      await assert.rejects(avviaEliminazioni({ store: s2.store, archivio: archivio(s2.dataDir), registro: registroEliminazioni(s2.elimDir) }), /eliminazioni\.jsonl/);
      assert.equal(existsSync(join(s2.elimDir, "eliminazioni.jsonl")), false, "файлът не се създава сам");
    } finally {
      await s2.close();
    }
    // … и при надгробен запис на документ.
    const s3 = await setup();
    try {
      await s3.store.documenti.elimina(randomUUID());
      await assert.rejects(avviaEliminazioni({ store: s3.store, archivio: archivio(s3.dataDir), registro: registroEliminazioni(s3.elimDir) }), /eliminazioni\.jsonl/);
    } finally {
      await s3.close();
    }
  } finally {
    await s.close();
  }
});
