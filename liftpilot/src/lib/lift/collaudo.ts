// The standards of the lift's acceptance test (collaudo) and what the intervention replaces or changes. The test has a
// base standard: a new lift is tested to UNI EN 81-20:2020 and UNI EN 81-50:2020, every check applies; a modification
// of an existing lift to UNI 10411-1:2024 (a lift not built to the directives) or UNI 10411-11:2024 (built to
// 95/16/CE or 2014/33/UE), where a check applies only when the intervention touches what it checks — a part replaced, a
// change of speed, load or travel —, the others concerning what stays as it is ("esistente": shown with their value,
// not counted). The designer can add standards to the base one: EN 81-20/50 as a whole on a modification, the
// accessibility of DM 236/1989 (its checks are the shaft's, computed for the case chosen there). Each standard has its
// own result; the test's result is the worst of them. The standards that can be added, where each fits (a new lift or a
// modification) and what is checked on site under each are in norme-collaudo.ts (research, chapter 16). Which parts
// each check concerns (ambito.ts) is the software's reading (registry impianto.collaudo), to be confirmed by the
// engineer on the standard in force. Pure.
import type { CheckId, FormValues } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import { AMBITO_10411_1, AMBITO_VERIFICHE, SOLO_10411_1, VERIFICHE_DATI } from './ambito';
import { NORME_INFO, type AmbitoNorma } from './norme-collaudo';
import { normaDaMarcatura, variazioniDi, type Carichi, type Libretto, type Marcatura, type Regolazione } from './modifica';

/** The base standard of the test: one, by the context. */
export const NORME_COLLAUDO = ['en81', '10411-1', '10411-11'] as const;
export type NormaCollaudo = (typeof NORME_COLLAUDO)[number];
/** Standards added to the base one, in the order the documents list them: EN 81-20/50 on a modification, the
 *  supplementary harmonised standards, the improvement of existing lifts, the national obligations. */
export const NORME_AGGIUNTIVE = ['en81', 'en81-21', 'en81-28', 'en81-58', 'en81-70', 'en81-71', 'en81-72', 'en81-73', 'en81-76', 'en81-77',
  'en81-80', 'en81-82', 'en81-83', 'dm236', 'antincendio', 'ntc2018'] as const;
export type NormaAggiuntiva = (typeof NORME_AGGIUNTIVE)[number];
export type Norma = NormaCollaudo | NormaAggiuntiva;

/** The standard as the documents name it. */
export const NORMA_SIGLA: Readonly<Record<Norma, string>> = {
  en81: 'UNI EN 81-20:2020 e UNI EN 81-50:2020', '10411-1': 'UNI 10411-1:2024', '10411-11': 'UNI 10411-11:2024',
  'en81-21': 'UNI EN 81-21:2022 (ascensori nuovi in edifici esistenti)', 'en81-28': 'UNI EN 81-28:2022 (teleallarme)',
  'en81-58': 'UNI EN 81-58:2022 (resistenza al fuoco delle porte di piano)', 'en81-70': 'UNI EN 81-70:2022 (accessibilità)',
  'en81-71': 'UNI EN 81-71 (ascensori antivandalo)', 'en81-72': 'UNI EN 81-72:2020 (ascensori antincendio)',
  'en81-73': 'UNI EN 81-73:2020 (comportamento in caso d’incendio)', 'en81-76': 'UNI EN 81-76:2025 (evacuazione delle persone con disabilità)',
  'en81-77': 'UNI EN 81-77:2022 (azioni sismiche)', 'en81-80': 'UNI EN 81-80:2019 (miglioramento della sicurezza degli esistenti)',
  'en81-82': 'UNI EN 81-82:2026 (accessibilità degli esistenti)', 'en81-83': 'UNI EN 81-83:2026 (antivandalo degli esistenti)',
  dm236: 'DM 236/1989 (barriere architettoniche)', antincendio: 'DM 15/09/2005 o Codice di prevenzione incendi, RTV V.3 (antincendio)',
  ntc2018: 'NTC 2018 (strutture e azioni sismiche)',
};

/** The standard in a few characters (the verdict's badge). */
export const NORMA_BREVE: Readonly<Record<Norma, string>> = {
  en81: 'EN 81-20/50', '10411-1': 'UNI 10411-1', '10411-11': 'UNI 10411-11', 'en81-21': 'EN 81-21', 'en81-28': 'EN 81-28', 'en81-58': 'EN 81-58',
  'en81-70': 'EN 81-70', 'en81-71': 'EN 81-71', 'en81-72': 'EN 81-72', 'en81-73': 'EN 81-73', 'en81-76': 'EN 81-76', 'en81-77': 'EN 81-77',
  'en81-80': 'EN 81-80', 'en81-82': 'EN 81-82', 'en81-83': 'EN 81-83', dm236: 'DM 236/89', antincendio: 'Antincendio', ntc2018: 'NTC 2018',
};

/** What an intervention can replace (the parts) or change (speed, rated load, travel); round 46 (B7) appended, so that
 *  the stored arrays keep their order, the optional parts of a modernisation — the safety gear, the ACOP and UCM
 *  protections, the emergency alarm, the machine room, the car doors from hinged to sliding (intervento.ts
 *  PARTI_FACOLTATIVE; a test as new has them all). */
export const PARTI = ['machine', 'ropes', 'car', 'sling', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor', 'controller', 'speed', 'load', 'travel',
  'safetyGear', 'ucm', 'alarm', 'room', 'slidingDoors'] as const;
export type Parte = (typeof PARTI)[number];

/** The changes the rule brings among a modification's parts (round 46): the load by the documented loads, the speed and
 *  the travel by the logbook (modifica.ts variazioniDi) — the software's, never kept as the designer's answer
 *  (choiceOf, risposte.ts sceltaSalvata). */
export const AUTO_PARTI: readonly Parte[] = ['load', 'speed', 'travel'];

export interface Collaudo {
  norma: NormaCollaudo;
  /** standards added to the base one (absent: the base alone) */
  aggiuntive?: readonly NormaAggiuntiva[];
  /** replaced or changed by the intervention (a new lift: everything) */
  parti: readonly Parte[];
  /** the lift renewed but its sling (arcata), which stays: a modification tested to UNI 10411, not a new lift (site
   *  practice, registry impianto.rifacimento; intervento.ts); absent: the parts as chosen */
  rifacimento?: true;
  /** a modification: the answer about the lift's CE marking, which picks the part of UNI 10411, and, not known, the day
   *  it was put in service (YYYY-MM-DD; modifica.ts); absent: the part as chosen */
  marcatura?: Marcatura;
  servizio?: string;
  /** a modification: the loads the last report documents; their change can bring the checks of the load (modifica.ts) */
  documentato?: Carichi;
  /** a modification: the speed and the travel the logbook or a later verbale documents (round 46, UNI 10411-1/-11:2024,
   *  15 and 16; modifica.ts); absent: none entered */
  libretto?: Libretto;
  /** a modification: the speed regulation of the existing controller (round 46, UNI 10411-1:2024 11.2.1, UNI
   *  10411-11:2024 11.2); absent: not answered */
  regolazione?: Regolazione;
}

/** The check of a result: applies to the acceptance test, or concerns a part that stays as it is. */
export type Ambito = 'applies' | 'existing';

// which parts each check concerns (the table, the checks of one part of UNI 10411, those of the data): ambito.ts
export { AMBITO_10411_1, AMBITO_VERIFICHE, SOLO_10411_1, VERIFICHE_DATI } from './ambito';

/** The accessibility checks of DM 236/1989: the shaft's, present when its case is chosen in the shaft's data. */
export const VERIFICHE_DM236: readonly ShaftCheckId[] = ['v_acc_car', 'v_acc_door', 'v_acc_side', 'v_acc_c', 'v_call'];
/** The checks NTC 2018 computes: the beams under the machine and the HEB beams on the shaft's walls (σ ≤ fyk/γM0,
 *  deflection). The other standards added
 *  compute none: their points are checked on site (norme-collaudo.ts). */
export const VERIFICHE_NTC: readonly ShaftCheckId[] = ['m_beam', 'm_beamf', 'm_heb', 'm_hebf'];

const isNorma = (x: unknown): x is NormaCollaudo => NORME_COLLAUDO.some((n) => n === x);

/** The test's standards in order: the base one, then those added. */
export const normeOf = (C: Collaudo): Norma[] => [C.norma, ...(C.aggiuntive ?? [])];

/** Whether a check enters the test under one of its standards: under UNI 10411-1 the parts of AMBITO_VERIFICHE and of
 *  AMBITO_10411_1 (round 46), under -11 those of AMBITO_VERIFICHE. */
export function underNorma(C: Collaudo, n: Norma, id: CheckId | ShaftCheckId): boolean {
  const touched = (parti: readonly Parte[] | undefined): boolean => !!parti?.some((p) => C.parti.includes(p));
  if (SOLO_10411_1.some((x) => x === id)) return n === '10411-1' && touched(AMBITO_VERIFICHE[id]);
  if (n === 'en81') return true;
  if (n === 'dm236') return VERIFICHE_DM236.some((x) => x === id);
  if (n === 'ntc2018') return VERIFICHE_NTC.some((x) => x === id);
  if (n === '10411-1' || n === '10411-11') {
    return VERIFICHE_DATI.some((x) => x === id) || touched(AMBITO_VERIFICHE[id]) || (n === '10411-1' && touched(AMBITO_10411_1[id]));
  }
  return false;
}

/** Whether the test is that of a lift built or tested as new (EN 81-20/50 base), or of a modification. */
export const ambitoNorme = (C: Pick<Collaudo, 'norma'>): AmbitoNorma => (C.norma === 'en81' ? 'nuovo' : 'modifica');

/** Whether a standard can be added to the test's base (the compatibility matrix of chapter 16, §5.2). */
export const ammessa = (n: NormaAggiuntiva, base: NormaCollaudo): boolean => NORME_INFO[n].ambiti.includes(ambitoNorme({ norma: base }));

/** What the documents of the existing lift say, whatever part of UNI 10411 its CE marking picks: the documented loads,
 *  the logbook's speed and travel, the existing controller's speed regulation (round 46). */
export const documentiOf = (C: Partial<Pick<Collaudo, 'documentato' | 'libretto' | 'regolazione'>> | undefined): Pick<Collaudo, 'documentato' | 'libretto' | 'regolazione'> => ({
  ...(C?.documentato ? { documentato: C.documentato } : {}), ...(C?.libretto ? { libretto: C.libretto } : {}),
  ...(C?.regolazione ? { regolazione: C.regolazione } : {}),
});

/** What a modification knows of the existing lift: the answer about the CE marking with its day, what its documents
 *  say (intervento.ts and the form keep them across a change). */
export const esistenteOf = (C: Collaudo | undefined): Pick<Collaudo, 'marcatura' | 'servizio' | 'documentato' | 'libretto' | 'regolazione'> => ({
  ...(C?.marcatura ? { marcatura: C.marcatura } : {}), ...(C?.marcatura === 'incerta' && C.servizio ? { servizio: C.servizio } : {}),
  ...documentiOf(C),
});

/** What a modification carries besides its standards and parts: the renovation's mark and what it knows of the lift. */
export const modificaOf = (C: Collaudo | undefined): Pick<Collaudo, 'rifacimento' | 'marcatura' | 'servizio' | 'documentato' | 'libretto' | 'regolazione'> => ({
  ...(C?.rifacimento ? { rifacimento: true as const } : {}), ...esistenteOf(C),
});

/** A logbook without the speed after 50 Hz (UNI 10411-1 only); undefined when nothing else is left. */
function senzaV50(l: Libretto): Libretto | undefined {
  const out: Libretto = { ...(l.v !== undefined ? { v: l.v } : {}), ...(l.H !== undefined ? { H: l.H } : {}) };
  return out.v !== undefined || out.H !== undefined ? out : undefined;
}

/** The acceptance standards of the one form: a new lift is tested to EN 81-20/50 whatever was chosen; a replacement as
 *  chosen, by default UNI 10411-1 with the machine replaced (the intervention the software is made for). The standards
 *  added stay, in their order, once each, where they fit the base (EN 81-20/50 only on top of another base). A
 *  renovation keeps its sling, never among the parts replaced, and is one only under UNI 10411 (tested to EN 81-20/50
 *  the lift is tested as new). Under UNI 10411 the answer about the CE marking picks its part, and the documents of the
 *  existing lift bring the changes by the rule (AUTO_PARTI, modifica.ts variazioniDi, round 46): the loads documented
 *  against the design's bring the load, the logbook's speed and travel against the calculation's the speed and the
 *  travel. */
export function collaudoOf(calc: FormValues, chosen?: Collaudo): Collaudo {
  const added = (base: NormaCollaudo): NormaAggiuntiva[] => NORME_AGGIUNTIVE.filter((n) => chosen?.aggiuntive?.includes(n) && ammessa(n, base));
  const withAdded = (c: Collaudo): Collaudo => {
    const a = added(c.norma);
    return a.length ? { ...c, aggiuntive: a } : c;
  };
  if (calc.context === 'new') return withAdded({ norma: 'en81', parti: PARTI });
  if (chosen && isNorma(chosen.norma)) {
    if (chosen.norma === 'en81') return withAdded({ norma: 'en81', parti: PARTI });
    const rif = chosen.rifacimento === true, mod = modificaOf(chosen);
    const norma = (chosen.marcatura && normaDaMarcatura(chosen.marcatura, chosen.servizio)) || chosen.norma;
    const auto = variazioniDi(norma, mod, calc), byRule = (p: Parte): boolean => (p === 'load' || p === 'speed' || p === 'travel') && auto[p];
    // the speed after 50 Hz is UNI 10411-1's (15.1): typed under -1 and kept by the form when the CE answer makes it -11,
    // it is not part of the test (round 46 review: no hidden value stored)
    // (the keys in their order: a test without v50 to drop reads back as it was stored)
    const { libretto: lib, ...resto } = mod, drop = norma === '10411-11' && lib?.v50 !== undefined, l11 = drop && lib ? senzaV50(lib) : undefined;
    const noto = !drop ? mod : l11 ? { ...mod, libretto: l11 } : resto;
    return withAdded({ norma, parti: PARTI.filter((p) => (chosen.parti.includes(p) || byRule(p)) && !(rif && p === 'sling')), ...noto });
  }
  return { norma: '10411-1', parti: ['machine'] };
}

/** The parts of a test as a choice: a change the rule brings (AUTO_PARTI: the load by the documented loads, the speed and
 *  the travel by the logbook — collaudoOf) is the software's, not the designer's — it is left out unless it was chosen. */
export const choiceOf = (C: Collaudo, chosen: Collaudo | undefined): readonly Parte[] =>
  (C.norma === 'en81' || !AUTO_PARTI.some((p) => C.parti.includes(p) && !(chosen?.parti.includes(p) ?? false)) ? C.parti
    : C.parti.filter((p) => !AUTO_PARTI.includes(p) || (chosen?.parti.includes(p) ?? false)));

/** The test chosen with a standard added or taken off (`on`) in the options of the one form. Under a new lift what was
 *  chosen for a modification stays as it was (collaudoOf ignores it there; none chosen: the replacement's default), so
 *  going back loses nothing; the standards added are those chosen, also the ones that fit only the other base. */
export function withAggiunta(isNew: boolean, chosen: Collaudo | undefined, value: Collaudo, n: NormaAggiuntiva, on: boolean): Collaudo {
  const from = isNew ? chosen ?? collaudoOf({ context: 'repl' }) : value;
  const prev = chosen?.aggiuntive ?? value.aggiuntive ?? [];
  const aggiuntive = NORME_AGGIUNTIVE.filter((x) => (x === n ? on : prev.includes(x)));
  return { norma: from.norma, parti: choiceOf(from, chosen), ...modificaOf(from), ...(aggiuntive.length ? { aggiuntive } : {}) };
}

/** Whether a check applies to the acceptance test of this intervention: under any of its standards. */
export const ambitoOf = (C: Collaudo, id: CheckId | ShaftCheckId): Ambito => (normeOf(C).some((n) => underNorma(C, n, id)) ? 'applies' : 'existing');

/** A part the intervention leaves in place: one its acceptance test does not replace (a lift tested as new, UNI EN
 *  81-20/50: none). Sheet 1 writes it as existing, the bill and the draft order leave it out, the relazione names it so
 *  (the suspension ropes: ropesKept, which also reads the calculation). */
export const partKept = (C: Collaudo, p: Parte): boolean => C.norma !== 'en81' && !C.parti.includes(p);

/** The suspension ropes the intervention leaves in place: a part its test keeps (partKept) on a replacement whose
 *  calculation keeps the number and diameter of the ropes in place (inputs.ts keepRopes). Ropes of their own number
 *  and diameter are new whatever the parts of the test say: cut to length on sheet 1, in the bill and in the draft
 *  order, named new by the relazione. The one rule for the ropes. */
export const ropesKept = (C: Collaudo, V: FormValues): boolean => partKept(C, 'ropes') && V.context === 'repl' && !!V.keepRopes;

/** The two inputs disagree: the test keeps the ropes, the calculation gives ropes of their own number and diameter
 *  (new: ropesKept). The relazione asks to add the ropes to the parts of the test. */
export const ropesOutsideTest = (C: Collaudo, V: FormValues): boolean => partKept(C, 'ropes') && V.context === 'repl' && !V.keepRopes;

/** The adaptations a machine replaced under UNI 10411-1 brings (registry sostituzione.adeguamenti); none otherwise. */
export const adeguamentiDovuti = (C: Collaudo): boolean => C.norma === '10411-1' && C.parti.includes('machine');

type Verdict = { verdict: 'ok' | 'warn' | 'fail'; fails: number; warns: number };
const verdictOf = (on: readonly { status: string }[]): Verdict => {
  const fails = on.filter((c) => c.status === 'fail').length, warns = on.filter((c) => c.status === 'warn').length;
  return { verdict: fails ? 'fail' : warns ? 'warn' : 'ok', fails, warns };
};

/** The lift's verdict for its acceptance test: the worst status of the checks that apply under any of its standards,
 *  and how many fail or warn. */
export const collaudoVerdict = (C: Collaudo, checks: readonly { id: CheckId | ShaftCheckId; status: string }[]): Verdict =>
  verdictOf(checks.filter((c) => ambitoOf(C, c.id) === 'applies'));

/** The result under one standard: its checks among those computed (none computed: `ids` empty). */
export interface EsitoNorma extends Verdict {
  norma: Norma;
  ids: (CheckId | ShaftCheckId)[];
}

/** The result of each of the test's standards, in their order. */
export const esitiNorme = (C: Collaudo, checks: readonly { id: CheckId | ShaftCheckId; status: string }[]): EsitoNorma[] =>
  normeOf(C).map((norma) => {
    const on = checks.filter((c) => underNorma(C, norma, c.id));
    return { norma, ids: on.map((c) => c.id), ...verdictOf(on) };
  });
