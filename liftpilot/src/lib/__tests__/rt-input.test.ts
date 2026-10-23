// The inputs of the relazione tecnica di modifica and the installation's registry (round 49, RT plan §3): strict shapes,
// ranges and units; the draft keeps what is being typed, the issue asks the description, the two signatures and the
// sources of the component data (owner's decision 7); empty fields are missing ones; the stored registry is read
// leniently (like the plant data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOVERNORS } from '@/shaft/governor';
import { anagraficaData, anagraficaMancanti, anagraficaReadSchema, anagraficaSchema } from '@/lib/rt/anagrafica';
import { dataRtValida, giornoValido, mancantiEmissione, rtDraftSchema, rtInputsSchema, RT_MAX_ALLEGATI, type RtInputs } from '@/lib/rt/input';
import { fontiMancanti } from '@/lib/rt/input-componenti';
import { senzaVuoti } from '@/lib/rt/fonte';

const FONTE = { tipo: 'scheda', rif: 'scheda del costruttore n. 12' };
const PIENA: RtInputs = {
  doc: { data: '2026-10-20', descrizione: 'Sostituzione dell’argano e delle funi con un argano nuovo e funi nuove.' },
  firme: {
    redatto: { nome: 'Giulia Ferrari', qualifica: 'Responsabile tecnico' },
    verificato: { titolo: 'Ing.', nome: 'Marco Rossi', provincia: 'MI', numero: 'A-12345', sezione: 'A' },
  },
};
const ok = (x: unknown): boolean => rtInputsSchema.safeParse(x).success;
const bozza = (x: unknown): boolean => rtDraftSchema.safeParse(x).success;
const percorsi = (x: unknown): string[] => {
  const r = rtInputsSchema.safeParse(x);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

test('rt-input: l’emissione chiede descrizione e firme; la bozza tiene ciò che si scrive', () => {
  assert.ok(ok(PIENA));
  assert.deepEqual(percorsi({}), ['doc.descrizione', 'firme.redatto.nome', 'firme.verificato.titolo', 'firme.verificato.nome', 'firme.verificato.provincia', 'firme.verificato.numero']);
  assert.ok(!ok({ ...PIENA, doc: { descrizione: 'troppo breve' } }), 'descrizione sotto 20 caratteri');
  assert.ok(bozza({ doc: { descrizione: 'breve' }, firme: { verificato: { nome: 'M' } } }), 'la bozza tiene un testo in scrittura');
  assert.ok(!bozza({ doc: { descrizione: 'x'.repeat(4001) } }), 'oltre 4000 caratteri anche in bozza');
  assert.equal(mancantiEmissione(PIENA).length, 0);
  assert.ok(mancantiEmissione({}).every((m) => m.bloccante));
});

test('rt-input: forme strette, campi vuoti assenti, firme dell’ingegnere', () => {
  assert.ok(!ok({ ...PIENA, extra: 1 }), 'chiave sconosciuta');
  assert.ok(!ok({ ...PIENA, doc: { ...PIENA.doc, autore: 'x' } }), 'chiave sconosciuta nel blocco');
  assert.ok(ok({ ...PIENA, doc: { ...PIENA.doc, commessa: '', nota: '   ' } }), 'un campo vuoto è un campo assente');
  assert.deepEqual(senzaVuoti({ a: '', b: { c: ' ', d: 1, e: null }, f: ['', 'x'] }), { b: { d: 1 }, f: ['', 'x'] });
  const v = PIENA.firme?.verificato;
  for (const titolo of ['Arch.', 'Per. Ind.', 'Geom.']) assert.ok(!ok({ ...PIENA, firme: { ...PIENA.firme, verificato: { ...v, titolo } } }), titolo);
  assert.ok(ok({ ...PIENA, firme: { ...PIENA.firme, verificato: { ...v, titolo: 'Dott. Ing.' } } }));
  for (const numero of ['12 34', '<1>', 'x'.repeat(21)]) assert.ok(!ok({ ...PIENA, firme: { ...PIENA.firme, verificato: { ...v, numero } } }), numero);
  assert.ok(!ok({ ...PIENA, firme: { ...PIENA.firme, verificato: { ...v, sezione: 'C' } } }));
  assert.ok(!ok({ ...PIENA, firme: { ...PIENA.firme, verificato: { ...v, provincia: 'M' } } }));
});

test('rt-input: giorno della relazione, sezioni aggiunte, file e documenti', () => {
  for (const d of ['2026-02-30', '2026-13-01', '20261020', '2026-1-2']) assert.ok(!giornoValido(d), d);
  assert.ok(!ok({ ...PIENA, doc: { ...PIENA.doc, data: '2026-02-30' } }));
  assert.ok(dataRtValida('2026-10-20', '2026-10-21', '2026-10-01'));
  assert.ok(!dataRtValida('2026-10-22', '2026-10-21', '2026-10-01'), 'dopo oggi');
  assert.ok(!dataRtValida('2026-09-30', '2026-10-21', '2026-10-01'), 'prima del calcolo');
  assert.ok(ok({ ...PIENA, sezioniManuali: [{ key: 'porte', motivo: 'porte di piano verificate' }] }));
  assert.ok(!ok({ ...PIENA, sezioniManuali: [{ key: 'porte', motivo: 'uno' }, { key: 'porte', motivo: 'due' }] }), 'sezione doppia');
  assert.ok(!ok({ ...PIENA, sezioniManuali: [{ key: 'tetto', motivo: 'motivo' }] }));
  const a = (id: string) => ({ attachmentId: id });
  assert.ok(ok({ ...PIENA, allegati: [a('c1'), a('c2')] }));
  assert.ok(!ok({ ...PIENA, allegati: [a('c1'), a('c1')] }), 'file doppio');
  assert.ok(!ok({ ...PIENA, allegati: Array.from({ length: RT_MAX_ALLEGATI + 1 }, (_, i) => a(`c${i}`)) }), `oltre ${RT_MAX_ALLEGATI} file`);
  assert.ok(!ok({ ...PIENA, allegati: [a('../x')] }), 'identificativo');
  assert.ok(ok({ ...PIENA, documenti: { schema: 'c1', libretto: 'separato' } }));
  assert.ok(!ok({ ...PIENA, documenti: { manuale: 'c1' } }), 'documento sconosciuto');
});

test('rt-input: dati dei componenti — campi, unità e fonte richiesta all’emissione', () => {
  const comp = (componenti: unknown) => ({ ...PIENA, componenti });
  assert.ok(!ok(comp({ quadro: { tensioneComando: 230 } })), 'tensione senza fonte');
  assert.ok(bozza(comp({ quadro: { tensioneComando: 230 } })), 'in bozza la fonte può mancare');
  assert.ok(ok(comp({ quadro: { tensioneComando: 230, correnteComando: 'ca', fonte: FONTE } })));
  assert.ok(ok(comp({ quadro: { impiantoElettrico: 'rifatto' } })), 'la dichiarazione dell’installatore non chiede fonte');
  assert.ok(!ok(comp({ quadro: { tensioneComando: 500, fonte: FONTE } })), 'oltre 400 V');
  assert.ok(!ok(comp({ quadro: { tensioneComando: 230, fonte: { tipo: 'scheda', rif: 'x' } } })), 'riferimento della fonte sotto 3 caratteri');
  assert.deepEqual(fontiMancanti({ quadro: { tensioneComando: 230 }, porte: { piano: { fuocoNuova: 'EI60' } }, ammortizzatori: { cabina: { tipo: 'pu', certificato: { vMax: 1 } } } })
    .map((m) => [m.sezione, m.campo]), [['quadro', 'componenti.quadro.fonte'], ['ammortizzatori', 'componenti.ammortizzatori.cabina.fonte'], ['porte', 'componenti.porte.piano.fonte']]);
  // rails: Rm within 370–520 only (the omega method), profiles of the catalogue or typed with their source
  for (const Rm of [360, 530]) assert.ok(!ok(comp({ guideCabina: { Rm, fonte: FONTE } })), `Rm ${Rm}`);
  assert.ok(ok(comp({ guideCabina: { profilo: 'T89/B', Rm: 445, fonte: FONTE, arcata: 'zaino', xC: -120, xS: 80, h: 3200, pattini: 'rulli', accessi: 'A' } })));
  assert.ok(!ok(comp({ guideCabina: { profilo: 'T99/X' } })));
  assert.ok(ok(comp({ guideCabina: { profilo: 'custom', custom: { sigla: 'T 70 rilevata', A: 1080, Ix: 400000, Iy: 410000, Wx: 8700, Wy: 11700, iMin: 19.2, c: 8, q: 8.5 }, fonte: FONTE } })));
  assert.ok(!ok(comp({ guideCabina: { profilo: 'custom', custom: { A: -1 }, fonte: FONTE } })), 'sezione non positiva');
  assert.ok(!ok(comp({ guideCabina: { profilo: 'custom', custom: { A: 1080 } } })), 'sezione senza fonte');
  // buffers: the certificate's masses in order; the governor's data each with its own source
  const cert = (massaMin: number, massaMax: number) => comp({ ammortizzatori: { cabina: { tipo: 'pu', numero: 2, certificato: { numero: 'EU-BF 1', vMax: 1, massaMin, massaMax }, fonte: FONTE } } });
  assert.ok(ok(cert(300, 1500)));
  assert.ok(!ok(cert(1500, 300)), 'massa minima oltre la massima');
  assert.ok(!ok(comp({ ammortizzatori: { cabina: { tipo: 'gomma' } } })));
  assert.ok(!ok(comp({ ammortizzatori: { cabina: { numero: 5 } } })), 'oltre 4 ammortizzatori');
  assert.ok(ok(comp({ limitatore: { modello: GOVERNORS[0]?.model, vScatto: { valore: 1.2, fonte: { tipo: 'targa', rif: 'targa del limitatore' } } } })));
  assert.ok(ok(comp({ limitatore: { modello: 'manuale', manuale: { D: 200, d: 6, fonte: FONTE } } })));
  assert.ok(!ok(comp({ limitatore: { modello: 'Ignoto 9' } })));
  assert.ok(!ok(comp({ limitatore: { forzaTiro: { valore: 1292 } } })), 'forza senza fonte');
  assert.ok(bozza(comp({ limitatore: { forzaTiro: { fonte: { tipo: 'certificato' } } } })), 'in bozza il valore può mancare');
  assert.ok(ok(comp({ limitatore: { fune: { d: 6, caricoRottura: 25400, fonte: FONTE }, forzaTiro: { valore: 1292, fonte: FONTE }, forzaParacadute: { valore: 600, fonte: FONTE } } })));
  // doors: fire classes E/EI only, heights in mm
  assert.ok(ok(comp({ porte: { piano: { tipo: 'scorrevoli_automatiche', fuocoEsistente: 'E60', fuocoNuova: 'EI60', altezzaNuova: 2000, fonte: FONTE } } })));
  assert.ok(!ok(comp({ porte: { piano: { fuocoNuova: 'REI60', fonte: FONTE } } })));
  assert.ok(!ok(comp({ porte: { piano: { altezzaNuova: 2.0 } } })), 'altezza in metri');
  assert.ok(!ok(comp({ cabina: { superficie: 1.234, fonte: FONTE } })), 'superficie con 3 decimali');
  assert.ok(ok(comp({ cabina: { superficie: 1.23, fonte: FONTE }, contrappeso: { intervento: 'zavorre' } })));
});

test('rt-input: anagrafica — campi e limiti, fonte dei dati «prima», lettura indulgente', () => {
  const anno = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric' }).format(new Date()));
  const a = (x: unknown): boolean => anagraficaSchema.safeParse(x).success;
  assert.ok(a({ proprietario: { nome: 'Condominio Via Roma 1', indirizzo: 'Via Roma 1, Milano' }, manutentore: 'Ditta Manutenzioni', numeroFabbrica: 'F-1234',
    annoInstallazione: 1978, legge: 'dpr_1497_1963', leggeConfermata: true, prima: { persone: 6, fermate: 5, superficie: 1.4, fonte: 'libretto' } }));
  assert.ok(a({ annoInstallazione: anno }));
  assert.ok(!a({ annoInstallazione: anno + 1 }), 'anno futuro');
  assert.ok(!a({ annoInstallazione: 1899 }));
  assert.ok(!a({ legge: 'dm_1635_1979' }), 'il DM 1635/1979 non è offerto');
  assert.ok(!a({ prima: { persone: 6 } }), 'dato «prima» senza fonte');
  assert.ok(!a({ prima: { superficie: 1.234, fonte: 'rilievo' } }));
  assert.ok(!a({ prima: { fermate: 1, fonte: 'rilievo' } }));
  assert.ok(!a({ manutentore: 'X' }), 'sotto 2 caratteri');
  assert.ok(a({ manutentore: '', proprietario: { nome: 'Rossi', indirizzo: '' } }), 'campi vuoti assenti');
  assert.ok(!a({ committente: 'x' }), 'il committente è del progetto');
  // stored: unknown or out-of-range fields left out, the rest read
  assert.deepEqual(anagraficaData({ manutentore: 'Ditta', vecchio: 1, annoInstallazione: 1800, prima: { persone: 6, fermate: 500 } }),
    { manutentore: 'Ditta', prima: { persone: 6 } });
  assert.deepEqual(anagraficaData('rotto'), {});
  assert.ok(anagraficaReadSchema.safeParse({}).success);
  assert.deepEqual(anagraficaMancanti({}), ['proprietario.nome']);
  assert.deepEqual(anagraficaMancanti({ proprietario: { nome: 'Rossi' }, prima: { persone: 6 } }), ['prima.fonte']);
  assert.deepEqual(anagraficaMancanti({ proprietario: { nome: 'Rossi' }, prima: { persone: 6, fonte: 'verbale' } }), []);
});
