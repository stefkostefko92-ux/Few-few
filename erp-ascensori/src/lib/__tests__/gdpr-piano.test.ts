import test from "node:test";
import assert from "node:assert/strict";
import {
  pianoAnonimizzazione,
  datiAnonimizzati,
  residuiPersonali,
  emailAnonima,
  TIPI_SOGGETTO,
  ANONIMO,
  DOMINIO_ANONIMO,
} from "../gdpr/piano";

const ID = "0f7c2a91-4b3d-4e55-9a12-7c8e6d5f4321";

test("всеки вид субект има план", () => {
  for (const t of TIPI_SOGGETTO) {
    const p = pianoAnonimizzazione(t, ID);
    assert.ok(p.campi.length > 0, `${t}: празен план`);
    assert.ok(
      p.conservati.length > 0,
      `${t}: нищо не се пази — това не е вярно`,
    );
    // Всяко запазено нещо носи разпоредбата си: „защото така" не е основание.
    for (const c of p.conservati)
      assert.ok(c.base.length > 10, `${t}: липсва основание`);
  }
});

test("името пада при всички видове", () => {
  for (const t of TIPI_SOGGETTO) {
    const d = datiAnonimizzati(pianoAnonimizzazione(t, ID));
    assert.equal(d.nome, ANONIMO, t);
  }
});

test("подмененият адрес е УНИКАЛЕН и негоден за доставка", () => {
  const a = emailAnonima(ID);
  const b = emailAnonima("11111111-2222-3333-4444-555555555555");
  // `email` е уникална колона — константа би счупила втората анонимизация.
  assert.notEqual(a, b);
  // RFC 2606: `.invalid` гарантирано не се резолвва, тоест писмо не тръгва към
  // чуждо истинско лице.
  assert.match(a, new RegExp(`@${DOMINIO_ANONIMO.replace(".", "\\.")}$`));
});

test("удостоверенията падат заедно с потребителя", () => {
  const d = datiAnonimizzati(pianoAnonimizzazione("utente", ID));
  assert.equal(d.totpSegreto, null);
  assert.equal(d.refreshToken, null);
  assert.equal(pianoAnonimizzazione("utente", ID).revocaSessioni, true);
});

test("фискалните данни на дружеството се пазят изрично", () => {
  const p = pianoAnonimizzazione("amministratore", ID);
  const d = datiAnonimizzati(p);
  // Партидата остава: тя е реквизит на ВЕЧЕ издадена фактура.
  assert.equal("partitaIva" in d, false);
  assert.ok(p.conservati.some((c) => /633\/1972/.test(c.base)));
});

test("проверката за остатъци лови непочистено поле", () => {
  const p = pianoAnonimizzazione("dipendente", ID);
  const dopo = { ...datiAnonimizzati(p) };
  assert.deepEqual(residuiPersonali(p, dopo), []);

  // Някой е добавил поле и е забравил плана — или записът просто не е минал.
  assert.deepEqual(
    residuiPersonali(p, { ...dopo, telefono: "+39 333 1112223" }),
    ["telefono"],
  );
  assert.deepEqual(residuiPersonali(p, { ...dopo, nome: "Mario" }), ["nome"]);
});

test("одитът се пази с разпоредба, не мълчаливо", () => {
  for (const t of TIPI_SOGGETTO) {
    const p = pianoAnonimizzazione(t, ID);
    assert.ok(
      p.conservati.some((c) => /audit|registro/i.test(c.cosa)),
      `${t}: регистърът трябва да е обявен като запазен`,
    );
  }
});
