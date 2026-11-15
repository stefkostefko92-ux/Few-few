// The findings of Asansyorchika on the legal texts (15 November 2026), each against the law it comes from — only
// laws, quoted by article and paragraph (research/norme-ascensori/leggi/):
// 1. the plate in the car (D.P.R. 162/1999, art. 16 c. 3): who does the periodic checks, the installer and the
//    serial number were missing from "Impianto";
// 2. the year of installation and the CE marking — they decide which rules apply (D.M. 23/07/2009, artt. 1–2);
// 3. replacing the control panel, the machine or the power unit is a "modifica costruttiva" (D.P.R. 162/1999,
//    art. 2 c. 1 lett. i) n. 5) → new notice (art. 12 c. 4) and extraordinary check (art. 14 c. 3);
// 4. a stop for danger (art. 15 c. 7): the owner, the checking body and the Comune must be told;
// 5. the sizes of D.M. 236/1989, 8.1.12, written as constants and a check;
// 6. item 90 of the intervention sheet named only the notified body — art. 13 c. 1 names three.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { modificheCostruttive } from '../src/cartelli/da-scheda.js';
import { comunicazioniMancanti, parseCartello } from '../src/cartelli/form.js';
import { translatorFor } from '../src/i18n.js';
import { CAMBI_TESTO_VOCI, gruppiVoci, VOCI } from '../src/interventi/voci.js';
import {
  BOTTONIERA_DM236,
  CABINA_DM236,
  PORTE_DM236,
  verificaCabinaDm236,
} from '../src/schede/dm236.js';
import { SEARCHABLE, SECTIONS } from '../src/schede/fields.js';
import { normaModifiche, regimeDm2009, riferimentiNormativi } from '../src/schede/regime.js';
import { parseScheda } from '../src/schede/validation.js';

const t = translatorFor('it');
const base = { data: '2026-11-15', indirizzo: 'Via Roma 1, Milano' };

describe('1. the plate in the car (D.P.R. 162/1999, art. 16 c. 3)', () => {
  const impianto = SECTIONS.find((s) => s.key === 'impianto')!.fields.map((f) => f.key as string);

  it('has the checking body, the installer and the serial number, before the note', () => {
    for (const key of ['soggettoVerifiche', 'installatore', 'numeroFabbricazione']) {
      assert.ok(impianto.includes(key), key);
      assert.ok(impianto.indexOf(key) < impianto.indexOf('noteImpianto'), key);
      assert.ok((SEARCHABLE as readonly string[]).includes(key), `${key} is searchable`);
    }
    assert.equal(
      t('scheda.field.soggettoVerifiche'),
      'Soggetto incaricato delle verifiche periodiche',
    );
    assert.equal(t('scheda.field.installatore'), 'Installatore');
    assert.equal(t('scheda.field.numeroFabbricazione'), 'Numero di fabbricazione');
  });

  it('reads them from the form as short text', () => {
    const parsed = parseScheda({
      ...base,
      soggettoVerifiche: ' ASL Milano ',
      installatore: 'Ascensori Rossi S.r.l.',
      numeroFabbricazione: 'F-1234/85',
    });
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    assert.equal(parsed.data.soggettoVerifiche, 'ASL Milano');
    assert.equal(parsed.data.installatore, 'Ascensori Rossi S.r.l.');
    assert.equal(parsed.data.numeroFabbricazione, 'F-1234/85');
    const lungo = parseScheda({ ...base, numeroFabbricazione: 'x'.repeat(41) });
    assert.equal(!lungo.ok && lungo.errors.numeroFabbricazione, 'tooLong');
  });

  it('adds the columns in an additive migration', () => {
    const sql = migrazione('targa_anno_ce');
    for (const col of [
      '"soggettoVerifiche" VARCHAR(120)',
      '"installatore" VARCHAR(120)',
      '"numeroFabbricazione" VARCHAR(40)',
      '"annoInstallazione" INTEGER',
      '"marcaturaCe" BOOLEAN',
    ])
      assert.ok(sql.includes(col), col);
    assert.doesNotMatch(sql, /\bDROP\b|\bALTER COLUMN\b/);
  });
});

describe('2. year of installation and CE marking (D.M. 23/07/2009, artt. 1–2)', () => {
  it('are in "Impianto" and are read from the form', () => {
    const impianto = SECTIONS.find((s) => s.key === 'impianto')!.fields;
    const anno = impianto.find((f) => f.key === 'annoInstallazione');
    const ce = impianto.find((f) => f.key === 'marcaturaCe');
    assert.equal(anno?.kind, 'int');
    assert.equal(ce?.kind, 'yesno');
    const parsed = parseScheda({ ...base, annoInstallazione: '1985', marcaturaCe: 'no' });
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    assert.equal(parsed.data.annoInstallazione, 1985);
    assert.equal(parsed.data.marcaturaCe, false);
    const fuori = parseScheda({ ...base, annoInstallazione: '1700' });
    assert.equal(!fuori.ok && fuori.errors.annoInstallazione, 'range');
  });

  it('give the deadline class of art. 2 c. 2 for a lift without CE', () => {
    assert.deepEqual(regimeDm2009(1960, false), { esito: 'anteriore', anni: [2] });
    assert.deepEqual(regimeDm2009(1970, false), { esito: 'anteriore', anni: [3] });
    assert.deepEqual(regimeDm2009(1985, false), { esito: 'anteriore', anni: [4] });
    assert.deepEqual(regimeDm2009(1995, false), { esito: 'anteriore', anni: [5] });
  });

  it('say both classes in a boundary year — the day decides, the year does not', () => {
    assert.deepEqual(regimeDm2009(1964, false), { esito: 'anteriore', anni: [2, 3] });
    assert.deepEqual(regimeDm2009(1979, false), { esito: 'anteriore', anni: [3, 4] });
    assert.deepEqual(regimeDm2009(1991, false), { esito: 'anteriore', anni: [4, 5] });
    assert.deepEqual(regimeDm2009(1999, false), {
      esito: 'anteriore',
      anni: [5],
      forseDopo: true,
    });
  });

  it('do not apply D.M. 23/07/2009 to a CE lift, and never guess with missing data', () => {
    assert.deepEqual(regimeDm2009(2005, true), { esito: 'ce' });
    assert.deepEqual(regimeDm2009(1999, true), { esito: 'ce' });
    assert.deepEqual(regimeDm2009(null, true), { esito: 'ce' });
    assert.deepEqual(regimeDm2009(2005, false), { esito: 'dopoDpr162' });
    assert.deepEqual(regimeDm2009(null, false), { esito: 'datiMancanti' });
    assert.deepEqual(regimeDm2009(1985, null), { esito: 'datiMancanti' });
  });

  it('call a CE marking before 1999 incoherent: check the data, no UNI advice', () => {
    assert.deepEqual(regimeDm2009(1985, true), { esito: 'incoerente' });
    assert.deepEqual(regimeDm2009(1998, true), { esito: 'incoerente' });
    const { righe } = riferimentiNormativi(
      { annoInstallazione: 1985, marcaturaCe: true, tipoImpianto: ['ELETTRICO'] },
      t,
    );
    assert.equal(righe.length, 1);
    assert.ok(righe[0]!.includes('Controlla anno e marcatura CE'), righe[0]);
    assert.ok(!righe.some((r) => r.includes('UNI')), righe.join(' | '));
  });

  it('pick the UNI 10411 part for changes by CE marking and type of lift', () => {
    assert.equal(normaModifiche(false, ['ELETTRICO']), 'UNI 10411-1:2024');
    assert.equal(normaModifiche(false, ['GEARLESS']), 'UNI 10411-1:2024');
    assert.equal(normaModifiche(false, ['IDRAULICO']), 'UNI 10411-2:2024');
    assert.equal(normaModifiche(true, ['ELETTRICO']), 'UNI 10411-11:2024');
    assert.equal(normaModifiche(true, ['IDRAULICO']), 'UNI 10411-12:2024');
    assert.equal(normaModifiche(null, ['ELETTRICO']), null);
    assert.equal(normaModifiche(false, []), null);
  });
});

describe('3. a constructive change → extraordinary check (D.P.R. 162/1999, art. 2 c. 1 lett. i) n. 5)', () => {
  const elettrico = { tipoImpianto: ['ELETTRICO'], tipoPorte: ['AUTOMATICHE'] };

  it('is the panel, the machine or the power unit marked "Sì" on the scheda', () => {
    assert.deepEqual(modificheCostruttive({ ...elettrico, quadroSostituire: true }), ['quadro']);
    assert.deepEqual(
      modificheCostruttive({ ...elettrico, quadroSostituire: true, arganoPreventivo: true }),
      ['quadro', 'argano'],
    );
    assert.deepEqual(
      modificheCostruttive({
        tipoImpianto: ['IDRAULICO'],
        tipoPorte: ['AUTOMATICHE'],
        centralinaDaFare: true,
      }),
      ['centralina'],
    );
  });

  it('is not a light, a button panel or a hidden question', () => {
    assert.deepEqual(
      modificheCostruttive({ ...elettrico, luceVanoSostituire: true, bottoniereSostituire: true }),
      [],
    );
    // "Argano" does not exist on a hydraulic lift: the old answer says nothing.
    assert.deepEqual(
      modificheCostruttive({
        tipoImpianto: ['IDRAULICO'],
        tipoPorte: ['AUTOMATICHE'],
        arganoPreventivo: true,
      }),
      [],
    );
  });

  it('is said in Italian with the articles', () => {
    const testo = t('normativa.modifica.testo', { parti: 'del quadro elettrico' });
    for (const art of ['art. 2 c. 1 lett. i)', 'art. 12 c. 4', 'art. 14 c. 3'])
      assert.ok(testo.includes(art), art);
  });
});

describe('4. stop for danger (D.P.R. 162/1999, art. 15 c. 7)', () => {
  const cartello = { data: '2026-11-15', testo: 'Impianto fermo.' };

  it('keeps the day of each of the three notices', () => {
    const parsed = parseCartello({
      ...cartello,
      pericolo: 'si',
      avvisoProprietarioAt: '2026-11-15',
      avvisoVerificatoreAt: '',
      avvisoComuneAt: '2026-11-16',
    });
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    assert.equal(parsed.data.pericolo, true);
    assert.equal(parsed.data.avvisoProprietarioAt?.toISOString().slice(0, 10), '2026-11-15');
    assert.equal(parsed.data.avvisoVerificatoreAt, null);
    assert.deepEqual(comunicazioniMancanti(parsed.data), ['verificatore']);
  });

  it('asks nothing of a stop for works', () => {
    const parsed = parseCartello({ ...cartello, avvisoComuneAt: '' });
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    assert.equal(parsed.data.pericolo, false);
    assert.equal(parsed.data.avvisoComuneAt, null);
    assert.deepEqual(comunicazioniMancanti(parsed.data), []);
  });

  it('refuses a notice day without the danger tick, instead of dropping it', () => {
    const parsed = parseCartello({ ...cartello, avvisoComuneAt: '2026-11-16' });
    assert.equal(parsed.ok, false);
    assert.equal(!parsed.ok && parsed.errors.pericolo, 'required');
  });

  it('lists all three when none is done, and refuses a wrong day', () => {
    const parsed = parseCartello({ ...cartello, pericolo: 'si' });
    if (!parsed.ok) assert.fail(JSON.stringify(parsed.errors));
    assert.deepEqual(comunicazioniMancanti(parsed.data), [
      'proprietario',
      'verificatore',
      'comune',
    ]);
    const sbagliato = parseCartello({ ...cartello, pericolo: 'si', avvisoComuneAt: '2026-02-30' });
    assert.equal(!sbagliato.ok && sbagliato.errors.avvisoComuneAt, 'invalidDate');
  });

  it('adds the columns and the check in an additive migration', () => {
    const sql = migrazione('fermo_pericolo');
    for (const col of [
      '"pericolo" BOOLEAN NOT NULL DEFAULT false',
      '"avvisoProprietarioAt" DATE',
      '"avvisoVerificatoreAt" DATE',
      '"avvisoComuneAt" DATE',
      'Cartello_pericolo_check',
    ])
      assert.ok(sql.includes(col), col);
    assert.doesNotMatch(sql, /\bDROP\b|\bALTER COLUMN\b/);
  });
});

describe('5. D.M. 236/1989, 8.1.12 — the lift sizes', () => {
  it('has the three cabins in mm, as in the decree', () => {
    assert.deepEqual(CABINA_DM236.a, {
      profonditaMm: 1400,
      larghezzaMm: 1100,
      portaLuceMm: 800,
      piattaformaMm: 1500,
    });
    assert.deepEqual(CABINA_DM236.b, {
      profonditaMm: 1300,
      larghezzaMm: 950,
      portaLuceMm: 800,
      piattaformaMm: 1500,
    });
    assert.deepEqual(CABINA_DM236.c, {
      profonditaMm: 1200,
      larghezzaMm: 800,
      portaLuceMm: 750,
      piattaformaMm: 1400,
    });
    assert.deepEqual(PORTE_DM236, { apertaMinS: 8, chiusuraMinS: 4 });
    assert.deepEqual(BOTTONIERA_DM236, {
      altezzaMinMm: 1100,
      altezzaMaxMm: 1400,
      dallaPortaMinMm: 350,
    });
  });

  it('checks a measured cabin: at least the size, missing is missing', () => {
    const esiti = verificaCabinaDm236('c', {
      profonditaMm: 1200,
      larghezzaMm: 790,
      portaLuceMm: 750,
    });
    assert.deepEqual(
      esiti.map((e) => [e.voce, e.esito]),
      [
        ['profondita', 'ok'],
        ['larghezza', 'no'],
        ['portaLuce', 'ok'],
        ['piattaforma', 'manca'],
      ],
    );
  });
});

describe('6. item 90 of the intervention sheet (D.P.R. 162/1999, art. 13 c. 1)', () => {
  it('names the three bodies that may do the check, not only the notified body', () => {
    const testo = VOCI.find((v) => v.n === 90)!.testo;
    for (const nome of ['ASL', 'ARPA', 'DPL', 'Organismo Notificato'])
      assert.ok(testo.includes(nome), nome);
  });

  // The seal of a confirmed sheet covers numbers and values, not the text (src/interventi/sigillo.ts):
  // a sheet confirmed before the change is drawn again with the words it was signed with.
  const vecchio =
    "Assistenza Tecnica all'Ingegnere dell'Organismo Notificato durante l'esecuzione della Verifica Periodica/Straordinaria";
  const testo90 = (al: Date) =>
    gruppiVoci(al)
      .flatMap((g) => g.voci)
      .find((v) => v.n === 90)!.testo;

  it('keeps the old words, word for word, on a sheet confirmed before the change', () => {
    const cambio = CAMBI_TESTO_VOCI.find((c) => c.n === 90)!;
    assert.equal(cambio.prima, vecchio);
    assert.equal(testo90(new Date(cambio.dal.getTime() - 1)), vecchio);
    assert.equal(testo90(new Date('2026-11-01T10:00:00Z')), vecchio);
  });

  it('uses the new words on a sheet confirmed from the change on', () => {
    const cambio = CAMBI_TESTO_VOCI.find((c) => c.n === 90)!;
    const nuovo = VOCI.find((v) => v.n === 90)!.testo;
    assert.notEqual(nuovo, vecchio);
    assert.equal(testo90(cambio.dal), nuovo);
    assert.equal(testo90(new Date('2027-01-01T00:00:00Z')), nuovo);
    // The other items and the groups do not move.
    const prima = gruppiVoci(new Date(cambio.dal.getTime() - 1));
    assert.deepEqual(
      prima.map((g) => [g.titolo, g.voci.map((v) => v.n)]),
      gruppiVoci(cambio.dal).map((g) => [g.titolo, g.voci.map((v) => v.n)]),
    );
    const altri = (gs: ReturnType<typeof gruppiVoci>) =>
      gs.flatMap((g) => g.voci).filter((v) => v.n !== 90);
    assert.deepEqual(altri(prima), altri(gruppiVoci(cambio.dal)));
  });
});

function migrazione(nome: string): string {
  const dir = new URL('../prisma/migrations/', import.meta.url);
  const cartella = readdirSync(dir).find((d) => d.endsWith(`_${nome}`));
  assert.ok(cartella, `migration *_${nome}`);
  return readFileSync(new URL(`${cartella}/migration.sql`, dir), 'utf8');
}
