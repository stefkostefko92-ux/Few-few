// The sections of the relazione tecnica di modifica's document by scenario (RT plan §5.1, §11.5): the fixed sections in
// their order and, between them, exactly the component sections the RT engine brings, in the engine's order; each with
// its reasons and clauses, its data, its checks (every one of the section, with its outcome and clause), its points and
// documents; a section the engineer adds is in with his reason; the rules and the sections they bring; the building's
// structures by the rule (the owner's declaration, the engineer's statement, the answer missing); the outcome of the
// checks with the verdict's counts; the documents attached and expected. Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PdfBlock, ReportDoc } from '../report/model';
import { buildRelazioneModifica } from '../report/rt/build';
import { DOC } from '../report/rt/testi';
import { titoloSezione } from '../rt/sezioni';
import type { RtDerived } from '../rt/types';
import { docInput, documenti, sezione, testi, testiBlocco } from './report-rt-fixtures';
import { SCENARI } from './fixtures/rt/scenari';

const RUNS = documenti();
const run = (nome: string) => { const r = RUNS.find((x) => x.s.nome === nome); assert.ok(r, nome); return r; };
const S = DOC.sezioni;
const titoli = (doc: ReportDoc<PdfBlock>): string[] => doc.blocks.flatMap((b) => (b.t === 'h2' ? [b.text.replace(/^\d+\. /, '')] : []));
const atteso = (d: RtDerived): string[] => [S.impianto, S.oggetto, S.riferimenti, S.primaDopo, S.regole, S.strutture, ...d.sezioni.map((s) => titoloSezione(s.key)),
  S.esito, S.adempimenti, S.allegati, 'Nota sul software', S.firme];

test('sezioni del documento: le fisse e, in mezzo, esattamente quelle del motore RT nel suo ordine', () => {
  for (const { s, input, doc } of RUNS) assert.deepEqual(titoli(doc), atteso(input.derived), s.nome);
  // the scenarios of the plan (§11.4): Solo argano on the room path; with the load beyond prospetto 1; speed +8 % on the shaft path
  assert.deepEqual(run('locale-solo-argano').input.derived.sezioni.map((x) => x.key), ['funi', 'argano', 'locale']);
  for (const k of ['quadro', 'cabina', 'guideCabina', 'ammortizzatori', 'limitatore'] as const) assert.ok(titoli(run('locale-solo-argano-p1').doc).includes(titoloSezione(k)), k);
  assert.ok(titoli(run('vano-ammodernamento-velocita').doc).includes(titoloSezione('vano')));
  assert.ok(!titoli(run('locale-solo-argano').doc).includes(titoloSezione('vano')), 'il vano solo sul percorso del progetto');
});

test('sezione di un componente: motivi con la clausola, dati, verifiche con esito e riferimento, punti, documenti', () => {
  for (const { s, input, doc } of RUNS) {
    for (const z of input.derived.sezioni) {
      const B = sezione(doc, titoloSezione(z.key)), h3 = B.flatMap((b) => (b.t === 'h3' ? [b.text] : []));
      for (const h of [DOC.sub.perche, DOC.sub.dati, DOC.sub.verifiche, DOC.sub.documenti]) assert.ok(h3.includes(h), `${s.nome}/${z.key}: ${h}`);
      // every reason with its clause (the engineer's: his words)
      const reasons = B.find((b) => b.t === 'list');
      assert.ok(reasons && reasons.t === 'list');
      z.motivi.forEach((m, i) => assert.ok(m.tipo === 'manuale' || reasons.items[i]?.includes(m.clausola), `${s.nome}/${z.key}: ${reasons.items[i]}`));
      // every check of the section in its grid, in order, with the clause the engine gives it
      const checks = input.derived.checks.filter((c) => c.sezione === z.key);
      const grid = B.find((b) => b.t === 'grid' && b.head.join('|') === DOC.verifiche.head.join('|'));
      if (!checks.length) { assert.ok(!grid, `${s.nome}/${z.key}`); continue; }
      assert.ok(grid && grid.t === 'grid');
      assert.deepEqual(grid.rows.map((r) => r[4]), checks.map((c) => c.ref), `${s.nome}/${z.key}: riferimenti`);
      checks.forEach((c, i) => {
        const esito = grid.rows[i]?.[3] ?? '';
        if (c.mancanti?.length) assert.equal(esito, DOC.esiti.mancanti);
        else if (c.ambito === 'esistente') assert.ok(esito.startsWith(DOC.esiti.esistente), esito);
        else assert.equal(esito, DOC.esiti[c.status]);
      });
      // its points: each obligation and on-site point of the section by its clause
      const points = B.filter((b) => b.t === 'list').flatMap((b) => (b.t === 'list' ? b.items : [])).join('\n');
      for (const p of input.derived.punti.filter((x) => x.sezione === z.key)) assert.ok(points.includes(p.punto.testo), `${s.nome}/${z.key}: ${p.punto.rif}`);
    }
  }
});

test('documenti attesi: nella sezione del componente e negli allegati, con lo stato', () => {
  const { s, input, doc } = run('locale-solo-argano');
  const lib = input.derived.documenti.find((d) => d.id === 'libretto');
  assert.equal(lib?.stato, 'allegato');
  const all = sezione(doc, S.allegati).flatMap(testiBlocco);
  assert.ok(all.includes('Allegato 1') && all.includes(s.allegati[0]?.title ?? '?'));
  const macchina = sezione(doc, titoloSezione('argano')).flatMap(testiBlocco).find((t) => t.startsWith('Dati e dichiarazioni del costruttore della macchina'));
  assert.ok(macchina?.endsWith(DOC.documenti.daAllegare), macchina);
  // the files: number, title, pages and the start of the SHA-256
  const grid = sezione(doc, S.allegati).find((b) => b.t === 'grid');
  assert.ok(grid && grid.t === 'grid');
  assert.deepEqual(grid.rows.map((r) => [r[0], r[1], r[4], r[5]]), s.allegati.map((a) => [String(a.position), a.title, String(a.pages), `${a.sha256.slice(0, 16)}…`]));
});

test('sezione aggiunta dal tecnico: nel documento con il suo motivo, anche nella tabella delle sezioni', () => {
  const s = SCENARI[0]?.();
  assert.ok(s);
  const motivo = 'Porte di piano da verificare per la nuova velocità di livellamento';
  const doc = buildRelazioneModifica(docInput({ ...s, inputs: { ...s.inputs, sezioniManuali: [{ key: 'porte', motivo }] } }, 0));
  const B = sezione(doc, titoloSezione('porte'));
  assert.ok(B.flatMap(testiBlocco).includes(`Aggiunta dal tecnico: ${motivo}`));
  const row = sezione(doc, S.regole).flatMap((b) => (b.t === 'grid' ? b.rows : [])).find((r) => r[0] === titoloSezione('porte'));
  assert.deepEqual(row?.slice(1), [DOC.regole.manuale, `Aggiunta dal tecnico: ${motivo}`]);
});

test('regole della norma: la velocità +8 % si applica e porta le sue sezioni; i carichi senza documenti «dati mancanti»', () => {
  const { doc } = run('vano-ammodernamento-velocita');
  const rows = sezione(doc, S.regole).find((b) => b.t === 'grid');
  assert.ok(rows && rows.t === 'grid');
  const v = rows.rows.find((r) => r[0] === DOC.regole.nomi.velocita), q = rows.rows.find((r) => r[0] === DOC.regole.nomi.carico);
  assert.ok(v?.[2]?.startsWith(DOC.regole.esiti.scatta) && v[3]?.includes(titoloSezione('limitatore')), v?.join(' | '));
  assert.ok(q?.[2]?.startsWith(DOC.regole.esiti.dati_mancanti), q?.join(' | '));
});

test('strutture dell’edificio: dichiarazione del proprietario, dichiarazione del tecnico, risposta mancante', () => {
  const first = (nome: string): string => { const b = sezione(run(nome).doc, S.strutture)[1]; return b && b.t === 'p' ? b.text : ''; };
  assert.ok(first('locale-solo-argano-p1').startsWith('Serve la dichiarazione del proprietario') && first('locale-solo-argano-p1').endsWith(`${DOC.documenti.daAllegare}.`));
  assert.ok(first('vano-ammodernamento-velocita').startsWith('Dichiarazione del tecnico: per questa modifica le forze'));
  assert.ok(first('locale-solo-argano').startsWith('Risposta del tecnico mancante ⚠'));
  // never an unconditional «no change»
  for (const { doc } of RUNS) assert.ok(!testi(doc).some((t) => /nessuna variazione significativa/i.test(t)));
});

test('esito delle verifiche: ogni verifica una riga, il conteggio della modifica, mai l’esito della verifica straordinaria', () => {
  for (const { s, input, doc } of RUNS) {
    const B = sezione(doc, S.esito), grid = B.find((b) => b.t === 'grid'), v = B.find((b) => b.t === 'verdict');
    assert.ok(grid && grid.t === 'grid' && v && v.t === 'verdict');
    assert.equal(grid.rows.length, input.derived.checks.length, s.nome);
    const d = input.derived;
    assert.ok(v.text.includes(d.failCount || d.warnCount ? `${d.failCount} non soddisfatte, ${d.warnCount} con avviso` : DOC.esito.tutte), v.text);
    assert.equal(v.status, d.verdict === 'FAIL' ? 'fail' : d.verdict === 'WARN' ? 'warn' : 'ok');
    assert.ok(B.some((b) => b.t === 'p' && b.text === DOC.esito.nota));
    // D.1 and D.2 counted with the others when the ratio of the loads changes
    if (d.checks.some((c) => c.id === 'tr_d1')) assert.ok(grid.rows.some((r) => r[1]?.includes('stabilità allo scorrimento')));
  }
});

test('documento di un impianto CE (UNI 10411-11): la sua parte, la legge DPR 162/1999 scelta, nessuna regola d’origine', () => {
  const { doc } = run('vano-ce-carico'), all = testi(doc);
  const sub = doc.blocks.find((b) => b.t === 'sub');
  assert.ok(sub && sub.t === 'sub' && sub.text.includes('UNI 10411-11:2024'));
  assert.ok(all.some((t) => t.startsWith('DPR 162/1999 (marcatura CE), indicato nell’anagrafica')));
  assert.ok(!all.some((t) => t.includes(DOC.verifiche.nomi.rt_gov_origin)));
  // a source missing at issue: the draft's box says so
  assert.ok(doc.blocks.some((b) => b.t === 'box' && b.text.startsWith('Per emettere la relazione mancano')));
});
