/**
 * „Buono di lavoro“ (собственикът, 12 ноември 2026 — „una voce nuovo buono di lavoro che ha queste
 * caratteristiche e questi campi“, по снимката на хартиения лист): частите на листа, без база.
 *
 * - Общите данни горе (дата на потвърждение, геометър, поръчка, оферта, предвидените дни, матрикула,
 *   място, P.O.S. SÌ/NO, бележки) — колоните на `BuonoLavoro`.
 * - Последователностите на работа — редове с описание, изход OK / NON OK, ден, подпис на изпълнителя и
 *   доставчик; колкото трябват (до `MAX_SEQUENZE`), всеки със свой постоянен id (подписът е вързан за него).
 * - Проверките — ЕДИН И СЪЩ списък на всеки лист (`CONTROLLI`): трите общи и трите „при смяна на таблото“.
 * - Отчетът (начало и край с часа, спиранията) и подписите долу (`FIRME_FINALI`) с фамилиите на техниците.
 * Всеки подпис е по избор (собственикът: „alcune firme possono essere lasciate vuote per poi farle a mano
 * sul foglio“) — празният е празно място на PDF-а.
 */

export const ESITI = ['ok', 'nonOk'] as const;
export type Esito = (typeof ESITI)[number];
export const isEsito = (value: unknown): value is Esito =>
  typeof value === 'string' && (ESITI as readonly string[]).includes(value);

/** Проверките на листа — в реда им; `quadro` — „In caso di sostituzione quadro di manovra“. */
export const CONTROLLI = [
  { key: 'extraCorsa', gruppo: 'generale' },
  { key: 'limitatore', gruppo: 'generale' },
  { key: 'organiSicurezza', gruppo: 'generale' },
  { key: 'serrature', gruppo: 'quadro' },
  { key: 'porteEsterne', gruppo: 'quadro' },
  { key: 'circuitoCabina', gruppo: 'quadro' },
] as const;
export type ControlloKey = (typeof CONTROLLI)[number]['key'];
export const CONTROLLO_KEYS: readonly ControlloKey[] = CONTROLLI.map((c) => c.key);
export const isControllo = (value: unknown): value is ControlloKey =>
  typeof value === 'string' && (CONTROLLO_KEYS as readonly string[]).includes(value);

/** Подписите долу на листа — в реда им; фамилиите на техниците са текст (`tecnici`), не подпис. */
export const FIRME_FINALI = ['custode', 'capoTecnico', 'geometra', 'capoOfficina'] as const;
export type FirmaFinale = (typeof FIRME_FINALI)[number];
export const isFirmaFinale = (value: unknown): value is FirmaFinale =>
  typeof value === 'string' && (FIRME_FINALI as readonly string[]).includes(value);

/** Най-много редове с работа на един лист; формата показва записаните и още `RIGHE_VUOTE` празни. */
export const MAX_SEQUENZE = 30;
export const RIGHE_VUOTE = 3;
/** Индексите на редовете във формата, които сървърът чете (празните между тях не броят). */
export const MAX_INDICE = 60;
/** На PDF-а — поне толкова редове (празните — за писане на ръка). */
export const RIGHE_STAMPA = 8;

export const MAX = {
  numero: 40,
  geometra: 80,
  ordine: 40,
  offerta: 40,
  matricola: 40,
  ubicazione: 200,
  note: 4000,
  descrizione: 300,
  fornitore: 80,
  noteControlli: 4000,
  sospensioni: 4000,
  tecnici: 200,
} as const;

/** Постоянният id на ред: 8 малки шестнадесетични знака (сървърът го дава на новия ред). */
export const ID_RIGA = /^[0-9a-f]{8}$/;
