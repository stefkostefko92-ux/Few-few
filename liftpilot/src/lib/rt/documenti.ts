// The documents the relazione tecnica di modifica expects (RT plan §4.8; registry entry relazione.documenti) and the
// building's structures (§4.5; relazione.strutture): by the parts replaced, the cases of the change and the sections in,
// the rows of the technical file of UNI 10411-1:2024 App. C and UNI 10411-11:2024 App. A, in our words with the clause.
// A document is attached when the engineer chose a file for it, or when exactly one expected document of its kind and
// component is open and a file of that kind and component is in the RT (two documents that a file could both be — the
// governor's and the safety gear's type certificates — wait for the engineer's choice); an expected document not
// attached prints «da allegare ⚠» and does not block the issue. Linear spring buffers need no file: the RT's section is
// the calculation App. C asks. Pure.
import type { BufferType } from '@/shaft/vertical';
import { NORMA_SIGLA, type Parte } from '../lift/collaudo';
import type { Plant } from '../plant';
import { carichiOf, variazioneCarico, type Norma10411 } from '../lift/modifica';
import type { CasoVariazione } from '../lift/obblighi-variazioni';
import type { RtInputs } from './input';
import { casiOf, type BaseSezioni } from './sezioni';
import type { AllegatoKind, Componente, DocumentoId, DocumentoRt, Motivo, RtAllegato, SezioneKey, SezioneRt, StruttureRt } from './types';

export interface DocumentoAtteso {
  id: DocumentoId;
  titolo: string;
  kind: AllegatoKind;
  /** what a file of it is filed under; the first is what an upload from the checklist presets */
  componenti: readonly Componente[];
  /** the clause, by the part of UNI 10411 */
  clausola: Readonly<Record<Norma10411, string>>;
  /** when it is expected, in words (the registry's) */
  quando: string;
  consigliato?: true;
}

const C1 = 'UNI 10411-1:2024', C11 = 'UNI 10411-11:2024';
const cl = (uno: string, undici: string): Readonly<Record<Norma10411, string>> => ({ '10411-1': `${C1}, ${uno}`, '10411-11': `${C11}, ${undici}` });

export const DOCUMENTI: readonly DocumentoAtteso[] = [
  { id: 'schema', titolo: 'Schema elettrico del quadro di manovra', kind: 'SCHEMA_ELETTRICO', componenti: ['quadro'], clausola: cl('App. C (11.1)', 'App. A (11.1)'), quando: 'quadro nuovo' },
  { id: 'quadro_ue', titolo: 'Dichiarazioni e certificati dei dispositivi elettrici di sicurezza del quadro', kind: 'DICHIARAZIONE_UE', componenti: ['quadro'],
    clausola: cl('App. C (11.1)', 'App. A (11.1)'), quando: 'quadro nuovo' },
  { id: 'macchina_ue', titolo: 'Dati e dichiarazioni del costruttore della macchina', kind: 'DICHIARAZIONE_UE', componenti: ['argano'], clausola: cl('App. C (14)', 'App. A (14)'),
    quando: 'macchina nuova' },
  { id: 'taratura', titolo: 'Relazione sulla taratura del variatore di frequenza per la velocità dichiarata', kind: 'RELAZIONE_TARATURA', componenti: ['quadro', 'argano'],
    clausola: cl('App. C (14) e (11.1)', 'App. A (11.1)'), quando: 'con la UNI 10411-1 macchina o quadro nuovi, con la UNI 10411-11 quadro nuovo' },
  { id: 'funi_cert', titolo: 'Certificati delle funi di trazione', kind: 'CERTIFICATO_COMPONENTE', componenti: ['funi'], clausola: cl('17.1 e App. C (17)', 'App. A (17)'),
    quando: 'funi nuove' },
  { id: 'limitatore_ue', titolo: 'Dichiarazione UE del limitatore di velocità', kind: 'DICHIARAZIONE_UE', componenti: ['limitatore'], clausola: cl('App. C (18)', 'App. A (18)'),
    quando: 'limitatore nuovo' },
  { id: 'limitatore_cet', titolo: 'Certificato d’esame UE del tipo del limitatore di velocità', kind: 'CERTIFICATO_ESAME_TIPO', componenti: ['limitatore'],
    clausola: cl('15.13, App. C (15, 18)', 'App. A (18)'), quando: 'limitatore nuovo; con la UNI 10411-1 anche il limitatore che resta, con la velocità aumentata' },
  { id: 'limitatore_fune', titolo: 'Certificato della fune del limitatore', kind: 'CERTIFICATO_COMPONENTE', componenti: ['limitatore'], clausola: cl('16 i) e 18', 'App. A (16 h) e 18)'),
    quando: 'limitatore nuovo o corsa allungata' },
  { id: 'paracadute_cet', titolo: 'Certificato d’esame UE del tipo e dichiarazione del paracadute', kind: 'CERTIFICATO_ESAME_TIPO', componenti: ['limitatore'],
    clausola: cl('6.1, 6.6, 6.7, 15.3 e App. C (6, 15)', '6.6, 6.7 e App. A (6, 15 b))'),
    quando: 'paracadute nuovo; con la UNI 10411-1 anche il paracadute che resta, con la portata o T* oltre il prospetto 1 o la velocità aumentata, '
      + 'e quello a presa progressiva con T* o contrappeso diminuiti' },
  { id: 'acop_cet', titolo: 'Certificati d’esame UE del tipo e dichiarazioni dei dispositivi ACOP e UCM',
    kind: 'CERTIFICATO_ESAME_TIPO', componenti: ['argano'], clausola: cl('6.12, 15.4 e App. C (6, 14, 15)', '6.10, 15 c) e App. A (6, 14, 15)'),
    quando: 'protezioni ACOP e UCM nuove; con la UNI 10411-1 anche con la portata o T* oltre il prospetto 1 o la velocità aumentata' },
  { id: 'ammortizzatori_cet', titolo: 'Certificato d’esame del tipo e dichiarazione degli ammortizzatori non lineari o idraulici', kind: 'CERTIFICATO_ESAME_TIPO',
    componenti: ['ammortizzatori'], clausola: cl('App. C (6.4, 15.2)', 'App. A (6.4, 15 a))'),
    quando: 'sezione degli ammortizzatori nella relazione, con ammortizzatori in poliuretano o idraulici (quelli a molla: il calcolo è la sezione stessa)' },
  { id: 'serrature_cet', titolo: 'Certificati d’esame del tipo delle serrature di piano', kind: 'CERTIFICATO_ESAME_TIPO', componenti: ['porte'],
    clausola: cl('12.2 e App. C (12, 19)', 'App. A (12, 19)'), quando: 'porte di piano o serrature nuove' },
  { id: 'porte_fuoco', titolo: 'Porte di piano resistenti al fuoco: certificato della classe', kind: 'CERTIFICATO_COMPONENTE', componenti: ['porte'],
    clausola: cl('19.2 e App. C (19)', '19 e App. A (19)'), quando: 'porte di piano nuove dove la porta esistente o quella nuova ha una classe di resistenza al fuoco' },
  { id: 'idoneita_strutture', titolo: 'Dichiarazione del proprietario sull’idoneità delle strutture dell’edificio', kind: 'DICHIARAZIONE_IDONEITA', componenti: ['edificio'],
    clausola: cl('5 e App. C (5)', '5 e App. A (5)'), quando: 'secondo la regola delle strutture (voce relazione.strutture)' },
  { id: 'ancoraggi', titolo: 'Dichiarazione di idoneità degli ancoraggi delle guide al vano', kind: 'DICHIARAZIONE_IDONEITA', componenti: ['guideCabina', 'guideContrappeso'],
    clausola: cl('App. C (6.5, 15.5)', 'App. A (6.5, 16 f))'), quando: 'sezione delle guide di cabina o del contrappeso nella relazione' },
  { id: 'allarme_ue', titolo: 'Attestazione del dispositivo di allarme di emergenza (UNI EN 81-28)', kind: 'DICHIARAZIONE_UE', componenti: ['impianto'],
    clausola: cl('23 e App. C (11.1, 23)', '23 e App. A (23)'), quando: 'allarme nuovo; con la UNI 10411-1 anche con il quadro nuovo' },
  { id: 'libretto', titolo: 'Copia del libretto o dell’ultimo verbale di verifica', kind: 'LIBRETTO_VERBALE', componenti: ['impianto'],
    clausola: cl('App. C (dati generali)', 'App. A (dati generali)'), quando: 'sempre (consigliato)', consigliato: true },
];

/** What the bases give the documents: the sections' base, with the shaft design's buffer types. */
export type BaseDocumenti = BaseSezioni & { lift?: { layout: { inputs: { room: unknown; vertical: { carBufferType?: BufferType; cwBufferType?: BufferType } } } } };
type InputsDocumenti = Pick<RtInputs, 'componenti' | 'strutture' | 'doc' | 'documenti'>;

interface Contesto {
  n: Norma10411; parti: readonly Parte[]; casi: readonly CasoVariazione[]; sezioni: readonly SezioneKey[]; inputs: InputsDocumenti; buffers: readonly BufferType[];
  strutture: StruttureRt;
  /** the car's safety gear of the plant data */
  gear: Plant['safetyGear'];
}

const has = (x: Contesto, p: Parte): boolean => x.parti.includes(p);
const caso = (x: Contesto, c: CasoVariazione): boolean => x.casi.includes(c);
const classe = (c: string | undefined): boolean => c !== undefined && c !== 'nessuna';

/** When each document is expected. */
const SERVE: Readonly<Record<DocumentoId, (x: Contesto) => boolean>> = {
  schema: (x) => has(x, 'controller'),
  quadro_ue: (x) => has(x, 'controller'),
  macchina_ue: (x) => has(x, 'machine'),
  taratura: (x) => has(x, 'controller') || (x.n === '10411-1' && has(x, 'machine')),
  funi_cert: (x) => has(x, 'ropes'),
  limitatore_ue: (x) => has(x, 'governor'),
  limitatore_cet: (x) => has(x, 'governor') || (x.n === '10411-1' && caso(x, 'speedUp')),
  limitatore_fune: (x) => has(x, 'governor') || caso(x, 'travelUp'),
  paracadute_cet: (x) => has(x, 'safetyGear') || (x.n === '10411-1' && (caso(x, 'loadP1') || caso(x, 'speedUp') || (caso(x, 'loadCalo') && x.gear === 'progressive'))),
  acop_cet: (x) => has(x, 'ucm') || (x.n === '10411-1' && (caso(x, 'loadP1') || caso(x, 'speedUp'))),
  ammortizzatori_cet: (x) => x.sezioni.includes('ammortizzatori') && x.buffers.some((t) => t !== 'spring'),
  serrature_cet: (x) => has(x, 'landingDoors') || !!x.inputs.componenti?.porte?.piano?.serratureNuove || !!x.inputs.componenti?.porte?.cabina?.serratureNuove,
  porte_fuoco: (x) => has(x, 'landingDoors') && (classe(x.inputs.componenti?.porte?.piano?.fuocoEsistente) || classe(x.inputs.componenti?.porte?.piano?.fuocoNuova)),
  idoneita_strutture: (x) => x.strutture.documento,
  ancoraggi: (x) => x.sezioni.includes('guideCabina') || x.sezioni.includes('guideContrappeso'),
  allarme_ue: (x) => has(x, 'alarm') || (x.n === '10411-1' && has(x, 'controller')),
  libretto: () => true,
};

/** The building's structures (UNI 10411-1:2024, 5; 6.3, 9.1, App. C (5), (6), (14); UNI 10411-11:2024, 6.2): the owner's
 *  declaration with the loads beyond prospetto 1 (-11: changed by over 10 %); with the machine new, the room's
 *  equipment or the layout changed, the engineer says whether the forces on the structures increase; with the
 *  counterweight beyond prospetto 2, whether the declaration is pertinent. Never an unconditional «no change». */
export function struttureRt(base: Pick<BaseSezioni, 'norma' | 'collaudo' | 'values'>, inputs: Pick<RtInputs, 'strutture' | 'doc'>): StruttureRt {
  const n = base.norma, casi = casiOf(base), parti = base.collaudo.parti, s = inputs.strutture, sigla = NORMA_SIGLA[n];
  const motivi: Motivo[] = [], domande: ('forze' | 'pertinente')[] = [];
  let documento = false, dichiarazione = false, manca = false, nonApplicato = false;
  const risposta = (si: boolean | undefined): void => { if (si === undefined) manca = true; else if (si) documento = true; else dichiarazione = true; };
  const aumento = casi.includes('loadP1') || casi.includes('loadP2');
  if (n === '10411-1' && casi.includes('loadP1')) {
    documento = true;
    motivi.push({ tipo: 'caso', chiave: 'loadP1', clausola: `${sigla}, 6.3 e 5`, testo: 'portata o T* oltre il prospetto 1' });
  }
  if (n === '10411-11' && aumento) {
    const ora = carichiOf(base.values), doc = base.collaudo.documentato, v = doc && ora ? variazioneCarico(n, doc, ora) : null;
    motivi.push({ tipo: 'caso', chiave: casi.includes('loadP1') ? 'loadP1' : 'loadP2', clausola: `${sigla}, 6.2 e 5`, testo: 'carichi aumentati' });
    if (v?.strutture === true) documento = true;
    else if (v?.strutture === false) nonApplicato = true;
    else { domande.push('pertinente'); risposta(s?.pertinente); }
  }
  const sposta: Parte | null = parti.includes('machine') ? 'machine' : parti.includes('room') ? 'room' : null;
  if (sposta || inputs.doc?.layoutModificato === true) {
    domande.push('forze');
    motivi.push({ tipo: 'parte', chiave: sposta ?? 'room', clausola: n === '10411-1' ? `${sigla}, 5, 9.1 e App. C (14)` : `${sigla}, 5 e App. A (9, 14)`,
      testo: sposta === 'machine' ? 'macchina nuova' : 'apparecchiature del locale spostate o aggiunte' });
    risposta(s?.forze === undefined ? undefined : s.forze === 'aumentano');
  }
  if (n === '10411-1' && casi.includes('loadP2')) {
    domande.push('pertinente');
    motivi.push({ tipo: 'caso', chiave: 'loadP2', clausola: `${sigla}, 6.1 e App. C (6)`, testo: 'contrappeso oltre il prospetto 2' });
    risposta(s?.pertinente);
  }
  const esito: StruttureRt['esito'] = documento ? 'documento' : manca ? 'manca_risposta' : dichiarazione ? 'dichiarazione' : nonApplicato ? 'non_applicato' : 'non_richiamato';
  return { esito, documento, domande: [...new Set(domande)], motivi };
}

/** The buffer types of the RT's sides: the shaft design's on the shaft path (springs when not set), the RT's on the
 *  room path. */
function tipiAmmortizzatori(base: BaseDocumenti, inputs: InputsDocumenti): BufferType[] {
  const v = base.lift?.layout.inputs.vertical, a = inputs.componenti?.ammortizzatori;
  return base.path === 'vano' && v ? [v.carBufferType ?? 'spring', v.cwBufferType ?? 'spring'] : [a?.cabina?.tipo, a?.contrappeso?.tipo].filter((t): t is BufferType => !!t);
}

/** The documents the RT expects, in the order of DOCUMENTI, each attached, delivered separately or to attach. */
export function documentiOf(base: BaseDocumenti, sezioni: readonly SezioneRt[], inputs: InputsDocumenti, allegati: readonly RtAllegato[],
  gear: Plant['safetyGear'] = undefined): DocumentoRt[] {
  const x: Contesto = {
    n: base.norma, parti: base.collaudo.parti, casi: casiOf(base), sezioni: sezioni.map((s) => s.key), inputs,
    buffers: tipiAmmortizzatori(base, inputs), strutture: struttureRt(base, inputs), gear,
  };
  const attesi = DOCUMENTI.filter((d) => SERVE[d.id](x));
  const scelto = (d: DocumentoAtteso): string | undefined => { const o = inputs.documenti?.[d.id]; return o === 'separato' || allegati.some((a) => a.attachmentId === o) ? o : undefined; };
  const presi = new Set(attesi.map(scelto).filter((o): o is string => !!o && o !== 'separato'));
  const candidati = (d: DocumentoAtteso): RtAllegato[] => allegati.filter((a) => a.kind === d.kind && a.component !== null && d.componenti.includes(a.component) && !presi.has(a.attachmentId));
  const aperti = attesi.filter((d) => !scelto(d));
  return attesi.map((d): DocumentoRt => {
    const base0 = { id: d.id, titolo: d.titolo, kind: d.kind, componente: d.componenti[0], clausola: d.clausola[x.n], consigliato: d.consigliato === true };
    const o = scelto(d);
    if (o === 'separato') return { ...base0, stato: 'separato' };
    const a = o ? allegati.find((f) => f.attachmentId === o) : undefined;
    if (a) return { ...base0, stato: 'allegato', allegato: { attachmentId: a.attachmentId, position: a.position, scelto: true } };
    // the automatic match only when no other open document could take the same file
    const mine = candidati(d), conteso = aperti.some((e) => e !== d && candidati(e).some((c) => mine.includes(c)));
    const first = conteso ? undefined : mine[0];
    return first ? { ...base0, stato: 'allegato', allegato: { attachmentId: first.attachmentId, position: first.position, scelto: false } } : { ...base0, stato: 'da_allegare' };
  });
}
