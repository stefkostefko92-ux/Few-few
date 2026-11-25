// "Buono di lavoro" (the owner, 12 November 2026, from the paper sheet of a client): the general data, the
// work sequences (as many rows as needed, each with outcome, day, signature and supplier), the same six
// checks on every sheet, the activity report and the signatures at the bottom. Every signature is optional
// ("some signatures may be left empty and signed by hand on the sheet") and bound to what it signs: a row
// signature to its row, a check signature to its outcome, the bottom ones to the whole sheet.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formValuesDaBuono,
  formValuesDalBody,
  indiciRighe,
  valoriDaScheda,
} from '../src/buoni/form-valori.js';
import { CONTROLLI, MAX_SEQUENZE } from '../src/buoni/voci.js';
import { errors, firma, FULL, json, parsed } from './buoni-dati.js';

describe('buono di lavoro: the form', () => {
  it('reads an empty form as an empty sheet: no rows, every check without outcome', () => {
    const { data, firme } = parsed({});
    assert.equal(data.numero, null);
    assert.equal(data.pos, null);
    assert.deepEqual(data.sequenze, []);
    assert.equal(Object.keys(data.controlli).length, CONTROLLI.length);
    for (const c of CONTROLLI) assert.deepEqual(data.controlli[c.key], { esito: null, data: null });
    assert.equal(firme.nuove.size, 0);
  });

  it('reads every field of the paper sheet', () => {
    const { data } = parsed(FULL);
    assert.equal(data.numero, 'B-2026/118');
    assert.equal(data.dataConferma, '2026-11-03');
    assert.equal(data.pos, true);
    assert.equal(data.inizioOra, '08:00');
    assert.equal(data.tecnici, 'Bianchi, Verdi');
    assert.deepEqual(data.controlli.limitatore, { esito: 'nonOk', data: '2026-11-20' });
    // Rows by their place in the form; the gap at 1 is not a row; the new row gets a new id.
    assert.deepEqual(data.sequenze, [
      {
        id: 'aaaaaaaa',
        descrizione: 'Smontaggio quadro esistente',
        esito: 'ok',
        data: '2026-11-16',
        fornitore: 'Pelazza',
      },
      {
        id: '00000000',
        descrizione: 'Montaggio quadro nuovo',
        esito: null,
        data: null,
        fornitore: null,
      },
    ]);
  });

  it('keeps a row id only once and only in its shape', () => {
    const { data } = parsed({
      'seq-0-id': 'abcdef01',
      'seq-0-descrizione': 'a',
      'seq-1-id': 'abcdef01',
      'seq-1-descrizione': 'b',
      'seq-2-id': 'NOT-AN-ID',
      'seq-2-descrizione': 'c',
    });
    const got = data.sequenze.map((r) => r.id);
    assert.equal(got[0], 'abcdef01');
    assert.equal(new Set(got).size, 3);
    assert.ok(got.every((id) => /^[0-9a-f]{8}$/.test(id)));
  });

  it('asks for the description of a row that says anything else', () => {
    assert.equal(errors({ 'seq-0-esito': 'ok' })['seq-0-descrizione'], 'required');
    assert.equal(errors({ 'seq-3-firma': json(firma(1)) })['seq-3-descrizione'], 'required');
  });

  it('refuses more rows than the sheet holds', () => {
    const body: Record<string, string> = {};
    for (let i = 0; i <= MAX_SEQUENZE; i += 1) body[`seq-${i}-descrizione`] = `riga ${i}`;
    assert.equal(errors(body).sequenze, 'range');
  });

  it('checks days, hours, outcomes and lengths', () => {
    assert.equal(errors({ dataConferma: '2026-02-31' }).dataConferma, 'invalidDate');
    assert.equal(
      errors({ 'seq-0-descrizione': 'x', 'seq-0-data': 'ieri' })['seq-0-data'],
      'invalidDate',
    );
    assert.equal(errors({ inizioLavori: '2026-11-16', inizioOra: '25:00' }).inizioOra, 'invalid');
    assert.equal(errors({ fineOra: '10:00' }).fineLavori, 'required');
    assert.equal(errors({ 'ctl-serrature-esito': 'forse' })['ctl-serrature-esito'], 'option');
    assert.equal(errors({ pos: 'boh' }).pos, 'option');
    assert.equal(errors({ geometra: 'x'.repeat(81) }).geometra, 'tooLong');
    assert.equal(
      errors({ ['seq-0-descrizione']: 'x'.repeat(301) })['seq-0-descrizione'],
      'tooLong',
    );
    assert.equal(errors({ geometra: ['a', 'b'] }).geometra, 'invalid');
  });

  it('does not let the end come before the start', () => {
    assert.equal(
      errors({ inizioPrevisto: '2026-11-16', finePrevista: '2026-11-15' }).finePrevista,
      'range',
    );
    assert.equal(
      errors({
        inizioLavori: '2026-11-16',
        inizioOra: '10:00',
        fineLavori: '2026-11-16',
        fineOra: '09:00',
      }).fineLavori,
      'range',
    );
    // The same day without hours is fine.
    parsed({ inizioLavori: '2026-11-16', fineLavori: '2026-11-16' });
  });

  it('reads the signatures sent with the rows and the checks, by their place', () => {
    const { firme, campi } = parsed({
      'seq-0-id': 'aaaaaaaa',
      'seq-0-descrizione': 'x',
      'seq-0-firma': json(firma(1)),
      'ctl-serrature-esito': 'ok',
      'ctl-serrature-firma': json(firma(2)),
      togli: ['c-limitatore', 'f-custode', 'junk'],
    });
    assert.deepEqual([...firme.nuove.keys()], ['s-aaaaaaaa', 'c-serrature']);
    assert.deepEqual([...firme.togli], ['c-limitatore']);
    assert.equal(campi.get('s-aaaaaaaa'), 'seq-0-firma');
    assert.equal(campi.get('c-serrature'), 'ctl-serrature-firma');
  });

  it('refuses a forged signature and a check signed without an outcome', () => {
    assert.equal(
      errors({ 'seq-0-descrizione': 'x', 'seq-0-firma': '{"s":[[1]]}' })['seq-0-firma'],
      'invalid',
    );
    assert.equal(
      errors({ 'ctl-limitatore-firma': json(firma(1)) })['ctl-limitatore-esito'],
      'required',
    );
  });

  it('gives the saved sheet back to the form, and the form back after an error', () => {
    const { data } = parsed(FULL);
    const values = formValuesDaBuono(data);
    assert.equal(values.pos, 'si');
    assert.equal(values['seq-1-descrizione'], 'Montaggio quadro nuovo');
    assert.deepEqual(indiciRighe(values), [0, 1]);
    const again = parsed(values);
    assert.deepEqual(again.data, data);
    const back = formValuesDalBody({ ...FULL, extra: 'x', 'seq-5-firma': json(firma(3)) });
    assert.equal(back.extra, undefined);
    assert.equal(back['seq-5-firma'], json(firma(3)));
    assert.deepEqual(indiciRighe(back), [0, 2, 5]);
  });

  it('fills a new sheet from the scheda: buono, matricola, address and the works it says', () => {
    const values = valoriDaScheda({
      indirizzo: 'Via Roma 1, Milano',
      matricola: 'MI 1',
      buonoLavoro: '118',
      tipoImpianto: ['ELETTRICO'],
      quadroSostituire: true,
      bottoniereSostituire: true,
    });
    assert.equal(values.numero, '118');
    assert.equal(values.matricola, 'MI 1');
    assert.equal(values.ubicazione, 'Via Roma 1, Milano');
    assert.equal(values['seq-0-descrizione'], 'Sostituzione del quadro di manovra');
    assert.equal(values['seq-1-descrizione'], 'Sostituzione delle bottoniere');
    const empty = valoriDaScheda({ indirizzo: null, matricola: null, buonoLavoro: null });
    assert.deepEqual(indiciRighe(empty), []);
  });
});
