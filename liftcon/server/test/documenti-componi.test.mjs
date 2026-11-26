// Сглобяването на документите (спецификация D3–D6, D12): детерминистично, от чеклиста и готовите фрази.
import { test } from "node:test";
import assert from "node:assert/strict";
import { componi } from "../dist/documenti/condiviso/componi.js";
import { completezza } from "../dist/documenti/condiviso/completezza.js";
import { nuovoDocumento } from "../dist/documenti/condiviso/nuovo.js";

const CAT = {
  sezioni: [
    {
      id: "locale",
      titolo: "Locale macchina",
      ubicazione: "Locale macchina",
      applicabile: ["elettrico_lm"],
      voci: [
        { id: "locale.porta", testo: "Porta del locale", anomalie: [{ id: "locale.porta.a1", testo: "Porta senza serratura", raccomandazione: "Chiedere al manutentore di ripristinare la serratura", priorita: "media" }], chiarimenti: [] },
        { id: "locale.luce", testo: "Illuminazione", anomalie: [], chiarimenti: [] },
      ],
    },
    {
      id: "fossa",
      titolo: "Fossa",
      ubicazione: "Fossa",
      voci: [
        { id: "fossa.pulizia", testo: "Pulizia del fondo", anomalie: [{ id: "fossa.pulizia.a1", testo: "Materiale estraneo sul fondo", raccomandazione: "Chiedere la rimozione al manutentore", priorita: "alta" }], chiarimenti: [] },
        { id: "fossa.acqua", testo: "Infiltrazioni", anomalie: [], chiarimenti: ["Chiedere al manutentore da quando è presente acqua"] },
      ],
    },
  ],
  documenti: [{ id: "libretto", nome: "Libretto dell'impianto" }],
};

function sopralluogo() {
  const d = nuovoDocumento("SOPRALLUOGO", "11111111-1111-4111-8111-111111111111");
  d.intestazione.committente.nome = "Condominio Via Roma 1";
  d.intestazione.committente.qualita = "Amministratore";
  d.intestazione.impianto = { ...d.intestazione.impianto, indirizzo: "Via Roma 1", comune: "Milano", provincia: "MI", tipo: "elettrico_lm" };
  d.intestazione.data = "2026-11-26";
  d.intestazione.oraInizio = "09:00";
  d.intestazione.oraFine = "10:30";
  d.intestazione.presenti = [{ nome: "Mario Bianchi", ruolo: "Tecnico manutentore" }];
  d.dati.esiti = {
    "locale.porta": { esito: "anomalia", nota: "", anomalia: { fraseId: "locale.porta.a1", testo: "Porta senza serratura", raccomandazione: "Chiedere al manutentore di ripristinare la serratura", priorita: "media" }, foto: ["f2"] },
    "locale.luce": { esito: "ok", nota: "", foto: [] },
    "fossa.pulizia": { esito: "anomalia", nota: "", anomalia: { fraseId: "fossa.pulizia.a1", testo: "Materiale estraneo sul fondo", raccomandazione: "Chiedere la rimozione al manutentore", priorita: "alta" }, foto: ["f1"] },
    "fossa.acqua": { esito: "chiarire", nota: "", domanda: "Chiedere al manutentore da quando è presente acqua", foto: [] },
  };
  d.foto = [
    { id: "f1", ordine: 1, didascalia: "Fondo della fossa", ubicazione: "Fossa", riferimento: "fossa.pulizia", larghezza: 800, altezza: 600 },
    { id: "f2", ordine: 2, didascalia: "Porta del locale macchina", ubicazione: "Locale macchina", riferimento: "locale.porta", larghezza: 800, altezza: 600 },
    { id: "f3", ordine: 3, didascalia: "Vista generale", ubicazione: "Atrio", riferimento: "", larghezza: 800, altezza: 600 },
  ];
  return d;
}

const testo = (c) => JSON.stringify(c);

test("sopralluogo: 7 секции в реда на сайта + report fotografico", () => {
  const c = componi(sopralluogo(), CAT);
  assert.deepEqual(
    c.sezioni.map((s) => s.titolo),
    ["1. Oggetto e limiti dell'incarico", "2. Impianto e documenti ricevuti", "3. Attività svolte", "4. Osservazioni e fotografie", "5. Anomalie osservate", "6. Punti da chiarire", "7. Raccomandazioni"],
  );
});

test("снимките се номерират по реда на чеклиста, после свободните; аномалиите ги цитират", () => {
  const c = componi(sopralluogo(), CAT);
  assert.deepEqual(c.foto.map((f) => [f.id, f.n]), [["f2", 1], ["f1", 2], ["f3", 3]]);
  const anomalie = c.sezioni[4].blocchi.find((b) => b.t === "tabella");
  assert.ok(anomalie, "аномалиите са таблица");
  assert.match(testo(anomalie.righe[0]), /Materiale estraneo.*Fossa.*Foto 2/s, "първа е с приоритет alta");
  assert.match(testo(anomalie.righe[1]), /Porta senza serratura.*Foto 1/s);
});

test("препоръките са без повторения и по приоритет; въпросите отиват в „Punti da chiarire“", () => {
  const d = sopralluogo();
  d.dati.osservazioni = [{ id: "o1", sezioneId: "fossa", testo: "Tracce di umidità sulle pareti", foto: [] }];
  d.dati.esiti["locale.luce"] = { esito: "anomalia", nota: "", anomalia: { fraseId: "x", testo: "Lampada guasta", raccomandazione: "Chiedere la rimozione al manutentore", priorita: "bassa" }, foto: [] };
  const c = componi(d, CAT);
  const racc = c.sezioni[6].blocchi.flatMap((b) => b.voci ?? []);
  assert.equal(racc.filter((r) => r.includes("Chiedere la rimozione")).length, 1, "една и съща препоръка веднъж");
  assert.match(racc[0], /rimozione/, "първа е препоръката с най-висок приоритет");
  assert.match(testo(c.sezioni[5]), /da quando è presente acqua/);
  assert.match(testo(c.sezioni[3]), /Tracce di umidità/);
});

test("недостъпните части (nv) влизат в „Attività svolte“; неприложимите секции не се показват", () => {
  const d = sopralluogo();
  d.dati.esiti["fossa.acqua"] = { esito: "nv", nota: "Fossa allagata, accesso non sicuro", foto: [] };
  d.intestazione.impianto.tipo = "elettrico_mrl";
  const c = componi(d, CAT);
  const att = testo(c.sezioni[2]);
  assert.match(att, /26\/11\/2026/);
  assert.match(att, /09:00.*10:30/s);
  assert.match(att, /Mario Bianchi/);
  assert.match(att, /Infiltrazioni.*Fossa allagata/s);
  assert.doesNotMatch(testo(c), /Porta senza serratura/, "секцията за locale macchina не важи за MRL");
});

test("резюмето брои аномалиите по приоритет и точките за изясняване", () => {
  const c = componi(sopralluogo(), CAT);
  const s = Object.fromEntries(c.sommario.map((r) => [r.etichetta, r.valore]));
  assert.equal(s["Anomalie osservate"], "2 (alta 1, media 1)");
  assert.equal(s["Punti da chiarire"], "1");
});

test("сглобеният текст не съдържа забранени думи като наша дейност", () => {
  const t = testo(componi(sopralluogo(), CAT)).toLowerCase();
  for (const w of ["conforme", "a norma", "collaudo eseguito", "certifichiamo", "perizia"]) assert.ok(!t.includes(w), w);
});

test("controllo qualità: таблица + difformità + точки за изясняване", () => {
  const d = nuovoDocumento("CONTROLLO_QUALITA", "22222222-2222-4222-8222-222222222222");
  d.dati.riferimento = "Preventivo n. 12 del 01/10/2026";
  d.dati.voci = [
    { id: "v1", richiesto: "Sostituzione porte di piano", dichiarato: "Eseguita", osservato: "Porte nuove a tutti i piani", esito: "corrispondente", nota: "", foto: [] },
    { id: "v2", richiesto: "Nuova bottoniera di cabina", dichiarato: "Eseguita", osservato: "Bottoniera originale", esito: "difforme", nota: "", foto: [] },
    { id: "v3", richiesto: "Illuminazione vano", dichiarato: "Eseguita", osservato: "", esito: "chiarire", nota: "Vano non accessibile", foto: [] },
  ];
  const c = componi(d, CAT);
  const t = testo(c);
  assert.match(t, /Sostituzione porte di piano/);
  assert.match(t, /Difformità osservate/);
  assert.match(t, /Nuova bottoniera di cabina/);
  assert.match(t, /Illuminazione vano/);
});

test("esame documentale: липсващите документи и отворените предписания отиват в отделни списъци", () => {
  const d = nuovoDocumento("ESAME_DOCUMENTALE", "33333333-3333-4333-8333-333333333333");
  d.dati.documenti = [{ voceId: "libretto", nome: "Libretto dell'impianto", esito: "assente", estremi: "", nota: "" }];
  d.dati.prescrizioni = [{ id: "p1", testo: "Sostituire le funi", stato: "aperta", nota: "", foto: [] }, { id: "p2", testo: "Ripristinare la luce", stato: "risolta", nota: "Fattura del 10/10", foto: [] }];
  const t = testo(componi(d, CAT));
  assert.match(t, /Documenti da richiedere.*Libretto dell'impianto/s);
  assert.match(t, /Punti aperti.*Sostituire le funi/s);
});

test("verbale: решения и действия с кой и до кога", () => {
  const d = nuovoDocumento("VERBALE", "44444444-4444-4444-8444-444444444444");
  d.dati.punti = [{ id: "p1", titolo: "Preventivi", discussione: "Confronto delle offerte", decisione: "Si procede con la ditta A" }];
  d.dati.azioni = [{ id: "a1", cosa: "Inviare l'ordine", chi: "Amministratore", entro: "2026-12-10", stato: "aperta" }];
  const t = testo(componi(d, CAT));
  assert.match(t, /Si procede con la ditta A/);
  assert.match(t, /Inviare l'ordine.*Amministratore.*10\/12\/2026/s);
});

test("пълнота: празната заглавна част, аномалия без текст и снимка без надпис спират издаването", () => {
  const d = sopralluogo();
  d.intestazione.committente.nome = "";
  d.dati.esiti["locale.porta"].anomalia.testo = "";
  d.foto[2].didascalia = "";
  const p = completezza(d);
  assert.ok(p.some((x) => /committente/i.test(x)));
  assert.ok(p.some((x) => /anomalia/i.test(x)));
  assert.ok(p.some((x) => /didascalia/i.test(x)));
  assert.deepEqual(completezza(sopralluogo()), []);
});

test("нов документ: предметът и границите са попълнени по вида", () => {
  for (const t of ["SOPRALLUOGO", "CONTROLLO_QUALITA", "ESAME_DOCUMENTALE", "VERBALE"]) {
    const d = nuovoDocumento(t, "55555555-5555-4555-8555-555555555555");
    assert.ok(d.intestazione.oggetto.length > 40, t);
    assert.ok(d.intestazione.limiti.length > 40, t);
    assert.equal(d.versione, 0);
    assert.equal(d.stato, "BOZZA");
  }
});
