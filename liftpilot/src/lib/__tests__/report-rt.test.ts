// The document of the relazione tecnica di modifica (RT plan §5, S6): the four golden installations build the same
// document twice; every check row carries its «Riferimento»; nothing prints «undefined», «NaN» or an object; an empty
// value is «—», never «0»; the part of UNI 10411 and the other standards are cited only with the edition of the job (the
// builder holds no edition of its own: they come from the registries and NORMA_SIGLA); no phrase of the third party's
// template is reproduced (denylist); the meta (header, notice, pages appended, the fascicolo's line), the draft and the
// signatures; and the SHA of each fixture's document, pinned with the RT engine's version (it enters the record's hash:
// docSha, rt-version.test.ts) — a change of the wording needs a new RT_ENGINE_VERSION.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { canon } from '@/calc/snapshot';
import { NORMA_SIGLA } from '../lift/collaudo';
import type { FirmeBlock, PdfBlock, ReportDoc } from '../report/model';
import { buildRelazioneModifica, pagineAllegati } from '../report/rt/build';
import { DOC } from '../report/rt/testi';
import { RT_ENGINE_VERSION } from '../rt/version';
import { docInput, documenti, testi } from './report-rt-fixtures';
import { SCENARI } from './fixtures/rt/scenari';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const RUNS = documenti();
const docSha = (doc: ReportDoc<PdfBlock>): string => createHash('sha256').update(JSON.stringify(canon({ blocks: doc.blocks, meta: doc.meta }))).digest('hex');

/** The SHA-256 of each fixture's document (its blocks and meta, as rt-hash.ts rtDocSha hashes them) and the RT engine's
 *  version it was pinned at. After an intended change of the document: bump RT_ENGINE_VERSION, then pin again
 *  (RT_DOC_PRINT=1 prints the new values). Round 49 fix step: re-pinned at 1.0.0 — the engine was never released, no RT
 *  issued in production (plan §1.2 names 1.0.0 the first release). Round 52: 1.1.0, the rope sheet's checks in the
 *  ropes' section. Round 57: 1.2.0, the owner's words (puleggia di trazione, Diretto/Indiretto 1:2, non soddisfatta). */
const PINNED = {
  version: '1.2.0',
  docSha: {
    'locale-solo-argano': 'ee3263cae4f433eee9e6fdebef9a615510899526afcb9a0800a3ba1c8d0db2e6',
    'locale-solo-argano-p1': '3a873a9b70012020b9a20c4cc60695e124057e6af966fd5a74f336fd5d66d2d2',
    'vano-ammodernamento-velocita': 'e9d87ef79ecdc57c999d7d0399e1c026fe1d00ac471312f9f617b165b9af5b65',
    'vano-ce-carico': '97e53305b8ac0c3552e90fe6726959724a5587a158fda85249af3461b5f830bb',
  } as Readonly<Record<string, string>>,
};

/** Phrases of the third party's template that must never appear (RT plan §5.2). */
const DENYLIST = ['Il presente fascicolo si compone', 'non conforme alla Direttiva Ascensori', 'Allegato alla Relazione di Calcolo', 'garantiscono un funzionamento sicuro',
  'paragrafo 6, punto 6.1', 'UNI 10411.1', 'UNI EN 81.20', 'UNI 10411 : 1994', 'nessuna variazione significativa', '10411-1:2014', '10411-1:2021', '10411.4'];

const SOURCES = readdirSync(path.join(root, 'src/lib/report/rt')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(path.join(root, 'src/lib/report/rt', f), 'utf8'));
const DOC_JSON = readFileSync(path.join(root, 'messages/rt/doc.json'), 'utf8');

test('documento RT: la stessa relazione due volte, sezioni numerate di seguito, riferimento in ogni verifica', () => {
  RUNS.forEach(({ s, input, doc }, i) => {
    const again = SCENARI[i]?.();
    assert.ok(again);
    assert.equal(docSha(buildRelazioneModifica(docInput(again, i))), docSha(doc), `${s.nome}: deterministica`);
    const h2 = doc.blocks.filter((b) => b.t === 'h2').map((b) => ('text' in b ? b.text : ''));
    h2.forEach((t, i) => assert.ok(t.startsWith(`${i + 1}. `), `${s.nome}: ${t}`));
    const grids = doc.blocks.filter((b) => b.t === 'grid' && b.head.join('|') === DOC.verifiche.head.join('|'));
    const rows = grids.flatMap((g) => (g.t === 'grid' ? g.rows : []));
    assert.equal(rows.length, input.derived.checks.length, `${s.nome}: una riga per verifica`);
    for (const r of rows) assert.ok((r[4] ?? '').length > 3, `${s.nome}: «${r[0]}» senza riferimento`);
  });
});

test('documento RT: nessun undefined, NaN, [object, Infinity; «—» per un dato vuoto, mai «0»', () => {
  for (const { s, input, doc } of RUNS) {
    const all = testi(doc).join('\n');
    assert.ok(!/undefined|NaN|\[object|Infinity|\bnull\b/.test(all), `${s.nome}: ${/.{0,60}(undefined|NaN|\[object|Infinity|\bnull\b).{0,60}/.exec(all)?.[0]}`);
    assert.ok(!/\{[A-Za-z]+\}/.test(all.replace(/\{[BAN]\}/g, '')), `${s.nome}: segnaposto non sostituito`);
    // «before» not documented: a dash and «non documentato ⚠», never a zero
    const pd = doc.blocks.find((b) => b.t === 'grid' && b.head[0] === DOC.primaDopo.head[0]);
    assert.ok(pd && pd.t === 'grid');
    input.derived.primaDopo.forEach((r, i) => {
      if (r.prima === null) assert.deepEqual([pd.rows[i]?.[1], pd.rows[i]?.[3]], ['—', DOC.primaDopo.nonDocumentato], `${s.nome}: ${r.grandezza}`);
    });
    // a check without its data: no value, «Dati mancanti ⚠»
    for (const g of doc.blocks) {
      if (g.t !== 'grid' || g.head.join('|') !== DOC.verifiche.head.join('|')) continue;
      for (const r of g.rows) if (r[3] === DOC.esiti.mancanti) assert.equal(r[1], '—', `${s.nome}: ${r[0]}`);
    }
  }
});

test('documento RT: edizioni solo dai registri e da NORMA_SIGLA; nessuna frase del modello di terzi', () => {
  // the builder and its texts hold no edition: every «:2024», «:2020» comes from a registry
  for (const src of [...SOURCES, DOC_JSON]) assert.ok(!/:(19|20)\d\d\b/.test(src.replace(/\d{4}-\d{2}-\d{2}/g, '')), /.{0,40}:(19|20)\d\d\b.{0,20}/.exec(src)?.[0]);
  for (const { s, doc } of RUNS) {
    const all = testi(doc).join('\n');
    for (const m of all.matchAll(/UNI 10411-(1|11):(\d{4})/g)) assert.equal(m[2], '2024', `${s.nome}: ${m[0]}`);
    for (const m of all.matchAll(/UNI EN 81-(20|50):(\d{4})/g)) assert.equal(m[2], '2020', `${s.nome}: ${m[0]}`);
    assert.ok(all.includes(NORMA_SIGLA[s.base.norma]), `${s.nome}: la parte della UNI 10411 del lavoro`);
    for (const p of DENYLIST) assert.ok(!all.includes(p), `${s.nome}: «${p}»`);
  }
  for (const p of DENYLIST) for (const src of [...SOURCES, DOC_JSON]) assert.ok(!src.includes(p), `sorgente: «${p}»`);
});

test('documento RT: intestazione, meta, pagine allegate e riga del fascicolo', () => {
  for (const { s, input, doc } of RUNS) {
    const n = input.number ?? '';
    assert.ok(doc.meta.header.includes(`RT ${n} R0`) && doc.meta.header.includes(input.project.name.slice(0, 20)), doc.meta.header);
    assert.equal(doc.meta.notice, DOC.notice);
    assert.equal(doc.meta.extraPages, s.allegati.reduce((a, x) => a + x.pages, 0));
    assert.equal(doc.meta.fascicolo, s.allegati.length ? DOC.fascicolo : DOC.fascicoloSenza);
    assert.ok(doc.meta.code.includes(input.derived.base.records.calc.sha256.slice(0, 16)));
    const kv = doc.blocks.find((b) => b.t === 'kv');
    assert.ok(kv && kv.t === 'kv' && kv.rows.some(([k, v]) => k === DOC.kv.numero && v === `RT ${n}`));
    assert.equal(doc.blocks[0]?.t, 'letterhead');
  }
  // a draft: no number, its warning, its notice, no file appended
  const s = SCENARI[0]?.();
  assert.ok(s);
  const draft = buildRelazioneModifica(docInput(s, 0, { number: null, revisions: [] }));
  assert.equal(draft.meta.notice, DOC.noticeBozza);
  assert.equal(draft.meta.extraPages, 0);
  assert.equal(pagineAllegati({ number: null, allegati: s.allegati }), 0);
  assert.equal(draft.meta.fascicolo, DOC.fascicoloBozza);
  assert.ok(draft.blocks.some((b) => b.t === 'box' && b.text === DOC.boxBozza));
});

test('documento RT: firme «Redatto da» e «Verificato da» con l’Ordine, i riquadri per la mano', () => {
  for (const { s, doc } of RUNS) {
    const f = doc.blocks.filter((b): b is FirmeBlock => b.t === 'firme');
    assert.equal(f.length, 1, s.nome);
    const [red, ver] = f[0]?.cols ?? [];
    assert.ok(red && ver);
    assert.deepEqual([red.title, red.box], [DOC.firme.redatto, { label: DOC.firme.firma, w: 70, h: 28 }]);
    assert.deepEqual([ver.title, ver.box], [DOC.firme.verificato, { label: DOC.firme.timbro, w: 45, h: 45 }]);
    const v = s.inputs.firme?.verificato;
    assert.ok(ver.lines.includes(`${v?.titolo} ${v?.nome}`) && ver.lines.some((l) => l.includes(`Provincia di ${v?.provincia} al n. ${v?.numero}`)), ver.lines.join(' / '));
    // the last blocks: the note on the software, then the signatures
    const i = doc.blocks.indexOf(f[0] as PdfBlock), h = doc.blocks[i - 1];
    assert.ok(h && h.t === 'h2' && h.text.endsWith(DOC.sezioni.firme));
  }
});

test('documento RT: lo SHA del documento di ogni impianto è fissato con la versione del motore RT', () => {
  const now = Object.fromEntries(RUNS.map(({ s, doc }) => [s.nome, docSha(doc)]));
  if (process.env.RT_DOC_PRINT) process.stdout.write(`${JSON.stringify(now, null, 2)}\n`);
  assert.deepEqual(Object.keys(now), Object.keys(PINNED.docSha));
  if (Object.entries(now).every(([k, v]) => PINNED.docSha[k] === v)) return;
  assert.notEqual(RT_ENGINE_VERSION, PINNED.version, `documento RT cambiato con la versione ancora ${PINNED.version}: alzare RT_ENGINE_VERSION, poi fissare i nuovi SHA`);
});
