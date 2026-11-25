// The owner's sheets of 3 November 2026: the power unit of a hydraulic lift (to replace: the data of the
// new one; to keep: the A3 kit for a Hydronic or another unit), the ropes to the right and to the left,
// the notes on the machine room, and on the argano data sheet the motor power written next to its own
// unit (the CV after "Kw" read as kW).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { lavoriDi } from '../src/cartelli/da-scheda.js';
import { ARGANI, fieldsOf } from '../src/ordini/moduli.js';
import { renderModulo } from '../src/ordini/pdf.js';
import { activeFields, fieldByKey, FIELDS, SEARCHABLE } from '../src/schede/fields.js';
import { pdfFontPaths } from '../src/schede/pdf.js';
import { parseScheda } from '../src/schede/validation.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const minimal = { data: '2026-11-03', matricola: '33871' };
const idraulico = { tipoImpianto: ['IDRAULICO'] };
const shownWith = (values: Record<string, unknown>) => activeFields((key) => values[key]);

describe('the power unit', () => {
  const NUOVA = [
    'centralinaMotoreV',
    'centralinaMotoreHp',
    'centralinaPompaLMin',
    'centralinaAvvio',
    'centralinaTensioneValvole',
    'centralinaDiametroTubazione',
    'centralinaMarcaPistone',
    'centralinaDiametroStelo',
    'centralinaCorsaImpianto',
    'centralinaTipoPistone',
    'centralinaLitriOlio',
  ];

  it('to replace asks the data of the new one, never the A3 kit', () => {
    const shown = shownWith({ ...idraulico, centralinaDaFare: 'si' });
    for (const key of NUOVA) assert.ok(shown.has(key), key);
    for (const key of ['emendamentoA3', 'centralinaInOpera', 'kitA3Hydronic'])
      assert.ok(!shown.has(key), key);
    assert.ok(shown.has('centralinaNoteRaccordi'));
  });

  it('to keep asks for the A3 kit, then which unit is there, then the parts of its kit', () => {
    const keep = { ...idraulico, centralinaDaFare: 'no' };
    const shown = shownWith(keep);
    for (const key of NUOVA) assert.ok(!shown.has(key), key);
    assert.ok(shown.has('emendamentoA3'));
    assert.ok(!shown.has('centralinaInOpera'));
    const kit = { ...keep, emendamentoA3: 'si' };
    assert.ok(shownWith(kit).has('centralinaInOpera'));
    assert.ok(shownWith(kit).has('tuboFlessibile'));
    const hydronic = shownWith({ ...kit, centralinaInOpera: 'HYDRONIC' });
    for (const key of ['kitA3Hydronic', 'kitA3TensioneBobine']) assert.ok(hydronic.has(key), key);
    for (const key of ['kitA3Valvola', 'kitA3Altro']) assert.ok(!hydronic.has(key), key);
    const altra = shownWith({ ...kit, centralinaInOpera: 'ALTRO' });
    for (const key of ['kitA3Valvola', 'kitA3Altro']) assert.ok(altra.has(key), key);
    assert.ok(!altra.has('kitA3Saracinesca'), 'the gate valve size only with the gate valve');
    assert.ok(
      shownWith({ ...kit, centralinaInOpera: 'ALTRO', kitA3Altro: ['SARACINESCA'] }).has(
        'kitA3Saracinesca',
      ),
    );
    // The question reads as on the sheet.
    assert.equal(fieldByKey('emendamentoA3')?.question, true);
  });

  it('keeps what the form sent for the branch it shows, and drops the other branch', () => {
    const parsed = parseScheda({
      ...minimal,
      ...idraulico,
      centralinaDaFare: 'no',
      emendamentoA3: 'si',
      centralinaInOpera: 'ALTRO',
      kitA3Valvola: 'HSV_440_BIS',
      kitA3Altro: ['BOBINA_48_12', 'SARACINESCA', 'PRESSOSTATO'],
      kitA3Saracinesca: 'ASS_3',
      kitA3Hydronic: ['CONNETTORE'],
      centralinaMotoreHp: '7,5',
      centralinaNoteRaccordi: 'Raccordo da 1" 1/2',
    });
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.data.kitA3Valvola, 'HSV_440_BIS');
    assert.deepEqual(parsed.data.kitA3Altro, ['BOBINA_48_12', 'SARACINESCA', 'PRESSOSTATO']);
    assert.equal(parsed.data.kitA3Saracinesca, 'ASS_3');
    assert.deepEqual(parsed.data.kitA3Hydronic, [], 'not a Hydronic unit');
    assert.equal(parsed.data.centralinaMotoreHp, null, 'the unit stays: no new motor');
    assert.equal(parsed.data.centralinaNoteRaccordi, 'Raccordo da 1" 1/2');

    const nuova = parseScheda({
      ...minimal,
      ...idraulico,
      centralinaDaFare: 'si',
      centralinaMotoreV: '400',
      centralinaMotoreHp: '7,5',
      centralinaPompaLMin: '150',
      centralinaAvvio: 'STELLA_TRIANGOLO',
      centralinaTipoPistone: 'IN_TAGLIA',
      centralinaLitriOlio: '120',
      emendamentoA3: 'si',
    });
    assert.ok(nuova.ok);
    if (!nuova.ok) return;
    assert.equal(nuova.data.centralinaMotoreV, 400);
    assert.equal(Number(nuova.data.centralinaMotoreHp), 7.5);
    assert.equal(nuova.data.centralinaAvvio, 'STELLA_TRIANGOLO');
    assert.equal(nuova.data.centralinaTipoPistone, 'IN_TAGLIA');
    assert.equal(nuova.data.emendamentoA3, null);
    const wrong = parseScheda({
      ...minimal,
      ...idraulico,
      centralinaDaFare: 'si',
      centralinaAvvio: 'SOFT_STARTER',
    });
    assert.equal(!wrong.ok && wrong.errors.centralinaAvvio, 'option');
  });
});

describe('the ropes and the machine room', () => {
  it('ask how many ropes are to the right and to the left, next to their number', () => {
    const keys = fieldsAround('funiNumero', 3);
    assert.deepEqual(keys, ['funiNumero', 'funiDx', 'funiSx']);
    const parsed = parseScheda({ ...minimal, funiNumero: '6', funiDx: '3', funiSx: '3' });
    assert.ok(parsed.ok);
    assert.deepEqual(
      parsed.ok && [parsed.data.funiNumero, parsed.data.funiDx, parsed.data.funiSx],
      [6, 3, 3],
    );
  });

  it('put the notes on the machine room right under where the machine is, and find them', () => {
    assert.deepEqual(fieldsAround('ubicazioneMacchina', 2), [
      'ubicazioneMacchina',
      'noteLocaleMacchina',
    ]);
    assert.ok((SEARCHABLE as readonly string[]).includes('noteLocaleMacchina'));
  });
});

describe('the sign from the card', () => {
  it('says new safety devices go in when a solution for the reduced space is ticked', () => {
    const elettrico = { tipoImpianto: ['ELETTRICO'], testataRidotta: true };
    assert.deepEqual(lavoriDi({ ...elettrico, testataInterventi: ['SEMAFORO'] }).installazione, [
      'di nuovi dispositivi di sicurezza',
    ]);
    assert.deepEqual(lavoriDi({ ...elettrico, testataInterventi: [] }).installazione, []);
  });
});

describe('the argano data sheet', () => {
  it('writes the motor power right before its own unit', () => {
    for (const key of ['potenzaKw', 'potenzaCv', 'ampere']) {
      const field = fieldsOf(ARGANI).find((f) => f.key === key);
      assert.ok(field && 'allinea' in field && field.allinea === 'destra', key);
    }
  });

  it('ends the CV right before "Cv", not right after "Kw"', { skip: !fontsHere }, async () => {
    const bytes = await renderModulo(ARGANI, { potenzaCv: '4', ampere: '6,5' }, fontDir);
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    const field = fieldsOf(ARGANI).find((f) => f.key === 'potenzaCv');
    assert.ok(field && 'line' in field);
    // The line ends 6 pt before the printed "Cv" (x 386): a value there cannot be read as kW.
    assert.ok(field.line[1] < 386 && field.line[1] > 376);
  });
});

/** The `n` fields of the card from `key` on, in the order of the form. */
function fieldsAround(key: string, n: number): string[] {
  const keys = FIELDS.map((field) => field.key);
  const i = keys.indexOf(key);
  return keys.slice(i, i + n);
}
