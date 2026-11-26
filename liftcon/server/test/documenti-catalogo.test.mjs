// Пазач на каталога (каталогът е с наши думи, описателен — liftcon/CLAUDE.md, т. 8 и лицензът на UNI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO } from "../dist/documenti/condiviso/catalogo/index.js";
import { TIPI_IMPIANTO, PRIORITA } from "../dist/documenti/condiviso/tipi.js";
import { componi } from "../dist/documenti/condiviso/componi.js";
import { nuovoDocumento } from "../dist/documenti/condiviso/nuovo.js";

const testi = () => {
  const t = [];
  for (const s of CATALOGO.sezioni) {
    t.push(s.titolo, s.ubicazione);
    for (const v of s.voci) t.push(v.testo, v.aiuto ?? "", ...v.chiarimenti, ...v.anomalie.flatMap((a) => [a.testo, a.raccomandazione]));
  }
  for (const d of CATALOGO.documenti) t.push(d.nome, d.aiuto ?? "", d.riferimento ?? "");
  for (const l of CATALOGO.lavori) t.push(l.titolo, ...l.voci);
  return t;
};

test("ID-тата са уникални и с префикса на секцията; приоритетите и типовете са валидни", () => {
  const ids = new Set();
  for (const s of CATALOGO.sezioni) {
    assert.ok(!ids.has(s.id), s.id);
    ids.add(s.id);
    for (const t of s.applicabile ?? []) assert.ok(TIPI_IMPIANTO.includes(t), `${s.id}: ${t}`);
    for (const v of s.voci) {
      assert.ok(v.id.startsWith(`${s.id}.`), v.id);
      assert.ok(!ids.has(v.id), v.id);
      ids.add(v.id);
      assert.ok(v.anomalie.length >= 1, `${v.id} senza frasi`);
      for (const a of v.anomalie) {
        assert.ok(a.id.startsWith(`${v.id}.`) && !ids.has(a.id), a.id);
        ids.add(a.id);
        assert.ok(PRIORITA.includes(a.priorita), a.id);
        assert.ok(a.testo.trim() && a.raccomandazione.trim(), a.id);
      }
    }
  }
});

test("без преценка за съответствие и без наша „verifica/collaudo/certificazione/perizia“", () => {
  const proibite = [/\bconform[ei]\b/i, /\bnon conform/i, /\ba norma\b/i, /fuori norma/i, /\bcollaud/i, /\bcertific/i, /\bperizi/i];
  for (const t of testi()) for (const re of proibite) assert.doesNotMatch(t, re, t);
});

test("без номера на точки от UNI/EN и без цитати на норми", () => {
  for (const t of testi()) {
    assert.doesNotMatch(t, /\bUNI\b|\bEN \d/, t);
    assert.doesNotMatch(t, /\b\d+\.\d+\.\d+/, t);
  }
});

test("сглобяването работи с целия каталог за всеки тип уредба", () => {
  for (const tipo of TIPI_IMPIANTO) {
    const d = nuovoDocumento("SOPRALLUOGO", "66666666-6666-4666-8666-666666666666");
    d.intestazione.impianto.tipo = tipo;
    for (const s of CATALOGO.sezioni) for (const v of s.voci) {
      const a = v.anomalie[0];
      d.dati.esiti[v.id] = { esito: "anomalia", nota: "", anomalia: { fraseId: a.id, testo: a.testo, raccomandazione: a.raccomandazione, priorita: a.priorita }, foto: [] };
    }
    const c = componi(d, CATALOGO);
    assert.equal(c.sezioni.length, 7, tipo);
    assert.match(c.sommario[0].valore, /^\d+ \(/, tipo);
  }
});
