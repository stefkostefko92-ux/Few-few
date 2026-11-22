// Shared data of the buono di lavoro unit tests (tests/buoni.test.ts, tests/buoni-firme.test.ts).
import assert from 'node:assert/strict';
import { parseBuono } from '../src/buoni/form.js';
import type { Firma } from '../src/interventi/firma.js';

export const firma = (seed: number): Firma => ({
  s: [[10 + seed, 20, 30 + seed, 40, 50, 60 + seed]],
});
export const json = (f: Firma) => JSON.stringify(f);

function ids() {
  let n = 0;
  return () => (n++).toString(16).padStart(8, '0');
}

export function parsed(body: Record<string, unknown>) {
  const result = parseBuono(body, ids());
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors));
  return result;
}

export function errors(body: Record<string, unknown>) {
  const result = parseBuono(body, ids());
  assert.ok(!result.ok, 'expected errors');
  return result.errors;
}

export const FULL = {
  numero: 'B-2026/118',
  dataConferma: '2026-11-03',
  geometra: 'Geom. Rossi',
  ordine: '4512',
  offerta: 'OF-77',
  inizioPrevisto: '2026-11-16',
  finePrevista: '2026-11-27',
  matricola: 'MI 123/45',
  ubicazione: 'Via Roma 1, Milano',
  pos: 'si',
  note: 'Chiavi dal portiere',
  'seq-0-id': 'aaaaaaaa',
  'seq-0-descrizione': 'Smontaggio quadro esistente',
  'seq-0-esito': 'ok',
  'seq-0-data': '2026-11-16',
  'seq-0-fornitore': 'Pelazza',
  'seq-2-descrizione': 'Montaggio quadro nuovo',
  'ctl-limitatore-esito': 'nonOk',
  'ctl-limitatore-data': '2026-11-20',
  noteControlli: 'Limitatore da ritarare',
  inizioLavori: '2026-11-16',
  inizioOra: '08:00',
  fineLavori: '2026-11-27',
  fineOra: '17:30',
  sospensioni: 'Fermo il 20/11 per mancanza materiale',
  tecnici: 'Bianchi, Verdi',
};
