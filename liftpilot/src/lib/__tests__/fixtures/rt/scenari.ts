// The four installations of the relazione tecnica di modifica's golden (RT plan §10, S3): a «Solo argano» on the room
// path with the documented loads unchanged; the same with the rated load increased beyond prospetto 1 (the load cases
// bring rails, buffers, governor, controller and car into the room path — owner's decision 2); an «Ammodernamento» on
// the shaft path with the rated speed 8 % over the logbook's (UNI 10411-1, 15.x); a CE-marked lift (UNI 10411-11) on the
// shaft path with the loads increased. Each base is built as the server's would be (src/server/rt/base.ts): the
// calculation analysed, its room survey derived or its lift design derived, with records named by fixed ids. Pure: the
// golden test and scripts/rt-golden-export.ts take them alike.
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { mergeChecks } from '@/shaft/checks';
import { collaudoOf, type Collaudo } from '../../../lift/collaudo';
import { deriveLift, newLift } from '../../../lift';
import type { Plant } from '../../../plant';
import { analyse } from '../../../present/analysis';
import { deriveRoom } from '../../../room/derive';
import { startSurvey } from '../../../room/survey';
import type { Anagrafica } from '../../../rt/anagrafica';
import type { RtInputs } from '../../../rt/input';
import type { RecordRef, RtAllegato, RtBase, RtTipo } from '../../../rt/types';

export interface Scenario {
  nome: string;
  base: RtBase;
  inputs: RtInputs;
  anagrafica: Anagrafica;
  plant: Plant;
  allegati: RtAllegato[];
}

const ref = (id: string, engineVersion: string): RecordRef => ({ id, sha256: id.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, 'a'), engineVersion, createdAt: '2026-10-21T08:00:00.000Z' });
const fonte = (rif: string, tipo: 'targa' | 'certificato' | 'scheda' | 'libretto' = 'scheda') => ({ tipo, rif });

const FIRME: RtInputs['firme'] = { redatto: { nome: 'Mario Rossi', qualifica: 'Tecnico' }, verificato: { titolo: 'Ing.', nome: 'Laura Bianchi', provincia: 'Milano', numero: 'A12345' } };
const DOC: RtInputs['doc'] = { data: '2026-10-21', descrizione: 'Sostituzione dell’argano e delle parti indicate, come da calcolo e progetto allegati.' };
const ANAGRAFICA: Anagrafica = {
  proprietario: { nome: 'Condominio Via Roma 1', indirizzo: 'Via Roma 1, Monza' }, manutentore: 'Ascensori Brianza', numeroFabbrica: 'F-1978-22',
  annoInstallazione: 1978, leggeConfermata: true, prima: { persone: 6, fermate: 5, superficie: 1.45, fonte: 'libretto' },
};
const PLANT: Plant = { safetyGear: 'progressive', carBracketPitch: 2000, cwBracketPitch: 2500, liftUse: 'passengers', control: 'Quadro a microprocessore' };
const ALLEGATI: RtAllegato[] = [
  { position: 1, attachmentId: 'att0libretto', kind: 'LIBRETTO_VERBALE', title: 'Libretto dell’impianto', component: 'impianto', sha256: 'a'.repeat(64), pages: 4, mime: 'application/pdf' },
  { position: 2, attachmentId: 'att0funi', kind: 'CERTIFICATO_COMPONENTE', title: 'Certificato funi', component: 'funi', sha256: 'b'.repeat(64), pages: 1, mime: 'application/pdf' },
];

/** The room path: the calculation of `values` with the test `chosen`, its survey of the machine room. */
function locale(tipo: RtTipo, values: FormValues, chosen: Collaudo): RtBase {
  const collaudo = collaudoOf(values, chosen), analysis = analyse(values), survey = startSurvey(600), derived = deriveRoom(values, survey, analysis);
  if (collaudo.norma === 'en81') throw new Error('fixture: a modification');
  return {
    path: 'locale', tipo, norma: collaudo.norma, collaudo, values, analysis, room: { survey, derived, checks: derived.checks },
    records: { calc: ref('calcroomfixture', '1.8.0'), room: ref('roomfixture', '1.17.0') },
  };
}

/** The shaft path: the lift design of the new lift with the calculation `calc` over it, the rated speed `v` and the
 *  rated load `Q` of its shaft (the design gives them to the calculation), and the test `collaudo`. */
function vano(tipo: RtTipo, calc: FormValues, collaudo: Collaudo, shaft: { v?: number; Q?: number } = {}): RtBase {
  const L0 = newLift(), S = L0.shaft;
  const d = deriveLift({ ...L0, calc: { ...L0.calc, ...calc }, collaudo,
    shaft: { ...S, ...(shaft.Q !== undefined ? { Q: shaft.Q } : {}), vertical: { ...S.vertical, ...(shaft.v !== undefined ? { v: shaft.v } : {}) } } });
  if (d.collaudo.norma === 'en81') throw new Error('fixture: a modification');
  return {
    path: 'vano', tipo, norma: d.collaudo.norma, collaudo: d.collaudo, values: d.values, analysis: d.analysis,
    lift: { layout: d.layout, dv: d, checks: mergeChecks(d.layout.checks, d.supportChecks), underPit: d.bottom === 'under' },
    records: { calc: ref('calcliftfixture', '1.8.0'), lift: ref('liftfixture', '1.33.0'), shaft: ref('shaftfixture', '2.27.0') },
  };
}

// the chapter 7 replacement, its maker's allowed shaft load raised over the calculation's (the golden checks the RT, not it)
const C: FormValues = { ...PRESETS.C, n_shaftMax: 3000 };
const SOLO: Collaudo = { norma: '10411-1', parti: ['machine'], marcatura: 'no', documentato: { Q: 630, P: 700, Mcw: 1015 }, libretto: { v: 1, H: 18 } };

export const SCENARI: readonly (() => Scenario)[] = [
  () => ({
    nome: 'locale-solo-argano', base: locale('SOLO_ARGANO', C, SOLO), anagrafica: ANAGRAFICA, plant: PLANT, allegati: ALLEGATI,
    inputs: { doc: DOC, firme: FIRME, allegati: ALLEGATI.map((a) => ({ attachmentId: a.attachmentId })), componenti: { quadro: { tensioneComando: 48, correnteComando: 'cc', fonte: fonte('Targa del quadro', 'targa') } } },
  }),
  () => ({
    nome: 'locale-solo-argano-p1', base: locale('SOLO_ARGANO', C, { ...SOLO, documentato: { Q: 500, P: 700, Mcw: 1000 } }), anagrafica: ANAGRAFICA, plant: PLANT, allegati: ALLEGATI,
    inputs: {
      doc: DOC, firme: FIRME, strutture: { forze: 'non_aumentano' }, allegati: ALLEGATI.map((a) => ({ attachmentId: a.attachmentId })),
      componenti: {
        quadro: { tensioneComando: 48, correnteComando: 'cc', fonte: fonte('Targa del quadro', 'targa') },
        guideCabina: { profilo: 'T70-1/A', arcata: 'centrale', A: 1100, B: 1400, h: 3000, accessi: 'A', colonna: 22, pattini: 'rulli', fonte: fonte('Rilievo del vano') },
        ammortizzatori: {
          cabina: { tipo: 'spring', numero: 1, corsa: 140, altezza: 260, forzaCorsaCompleta: 45000, fonte: fonte('Scheda ammortizzatore') },
          contrappeso: { tipo: 'spring', numero: 1, corsa: 80, altezza: 200 },
        },
        limitatore: {
          modello: 'LK200', vScatto: { valore: 1.3, fonte: fonte('Targa del limitatore', 'targa') }, forzaTiro: { valore: 520, fonte: fonte('Certificato limitatore', 'certificato') },
          forzaParacadute: { valore: 230, fonte: fonte('Certificato paracadute', 'certificato') }, fune: { d: 6, caricoRottura: 25400, fonte: fonte('Certificato fune', 'certificato') },
        },
      },
    },
  }),
  () => ({
    nome: 'vano-ammodernamento-velocita', anagrafica: ANAGRAFICA, plant: PLANT, allegati: ALLEGATI,
    base: vano('AMMODERNAMENTO', { context: 'repl' }, { norma: '10411-1', parti: ['machine', 'controller', 'governor'], marcatura: 'no', libretto: { v: 1 } }, { v: 1.08 }),
    inputs: {
      doc: DOC, firme: FIRME, strutture: { forze: 'non_aumentano' }, allegati: ALLEGATI.map((a) => ({ attachmentId: a.attachmentId })),
      componenti: {
        quadro: { tensioneComando: 230, correnteComando: 'ca', impiantoElettrico: 'compatibile_contrassegnato', tensioneContattiSerrature: 48, correnteContatti: 'cc', fonte: fonte('Schema del quadro') },
        limitatore: { vScatto: { valore: 1.4, fonte: fonte('Targa', 'targa') }, limiteOrigine: { valore: 1.5, fonte: fonte('Libretto', 'libretto') } },
        porte: { piano: { fuocoEsistente: 'E60', fuocoNuova: 'EI30', altezzaEsistente: 1900, fonte: fonte('Verbale di verifica', 'libretto') } },
      },
    },
  }),
  () => ({
    nome: 'vano-ce-carico', anagrafica: { ...ANAGRAFICA, annoInstallazione: 2004, legge: 'dpr_162_1999' }, plant: { ...PLANT, safetyGear: 'roller' }, allegati: [],
    base: vano('AMMODERNAMENTO', { context: 'repl' }, { norma: '10411-11', parti: ['machine', 'car'], marcatura: 'si', documentato: { Q: 480, P: 650, Mcw: 900 } }, { Q: 630 }),
    inputs: { doc: DOC, firme: FIRME, componenti: { ammortizzatori: { cabina: { certificato: { numero: 'PU-77', vMax: 1.2, massaMin: 300, massaMax: 1400 } } } } },
  }),
];
