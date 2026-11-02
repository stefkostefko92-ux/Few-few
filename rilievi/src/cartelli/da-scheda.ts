import { activeFields } from '../schede/fields.js';
import type { FormValues } from '../schede/field-parsers.js';

/**
 * Табелата от картата на уредбата (собственикът, 30 октомври 2026 — „usare le schede per auto compilare
 * cartello di fermo impianto“). Без база: входът е редът на картата и последната табела на същата уредба.
 *
 * - Адресът и градът: от последната табела на уредбата, ако има — там човекът вече ги е поправил на ръка;
 *   иначе адресът на картата се дели на последната запетая („Via Roma 1, 20121 Milano (MI)“ → „Via Roma
 *   1“ и „Milano“). Опашка с цифри без буква („Via Roma, 12“) не е град — адресът остава цял.
 * - Мястото на уредбата („Scala B“) — от предишната табела, иначе от края на адреса на картата, ако там
 *   стои част от сградата („…, Scala B“).
 * - Текстът към хората — от работите, които картата казва (табло, аргано, бутониери…), с думи за
 *   живеещите в сградата; без отбелязана работа — празен (не измисляме причина за спирането).
 * Всичко е предложение: формата е отворена, човекът го проверява преди „Salva“.
 */

export type ValoriScheda = Record<string, unknown>;

export interface CartelloPrecedente {
  indirizzo: string | null;
  citta: string | null;
  ubicazione: string | null;
}

/** Работите по картата: какво се сменя и какво се монтира — в реда, в който се четат на табелата. */
const SOSTITUZIONI: ReadonlyArray<{ campi: readonly string[]; testo: string }> = [
  { campi: ['quadroSostituire'], testo: 'del quadro di manovra' },
  { campi: ['arganoPreventivo'], testo: "dell'argano" },
  { campi: ['centralinaDaFare'], testo: 'della centralina' },
  {
    campi: ['operatore', 'sospensioni', 'serrature', 'pattinoRetrattile'],
    testo: 'dei meccanismi delle porte',
  },
  { campi: ['bottoniereSostituire'], testo: 'delle bottoniere' },
  { campi: ['luceVanoSostituire'], testo: "dell'illuminazione del vano" },
];

const INSTALLAZIONI: ReadonlyArray<{ campi: readonly string[]; testo: string }> = [
  {
    campi: ['telesoccorsoInstallare', 'perifericaInstallare', 'cornettaInstallare'],
    testo: 'del sistema di telesoccorso',
  },
  {
    campi: ['ami100', 'kitControlloGanasce', 'controlloQuadro', 'stopArgano'],
    testo: 'di nuovi dispositivi di sicurezza',
  },
];

/** „a“, „a e b“, „a, b e c“. */
function elenco(parti: readonly string[]): string {
  if (parti.length <= 1) return parti.join('');
  return `${parti.slice(0, -1).join(', ')} e ${parti.at(-1)}`;
}

/** Какво се сменя и монтира според картата — само видимите полета с „Sì“ (скритото не казва нищо). */
export function lavoriDi(scheda: ValoriScheda): {
  sostituzione: string[];
  installazione: string[];
} {
  const attivi = activeFields((key) => scheda[key]);
  const si = (campi: readonly string[]) =>
    campi.some((campo) => attivi.has(campo) && scheda[campo] === true);
  return {
    sostituzione: SOSTITUZIONI.filter((v) => si(v.campi)).map((v) => v.testo),
    installazione: INSTALLAZIONI.filter((v) => si(v.campi)).map((v) => v.testo),
  };
}

/** „2026-11-03“ → „3/11“, както в примера на собственика („Dal 3/11 l'impianto è fermo…“). */
function giornoMese(day: string): string | null {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${Number(match[2])}/${Number(match[1])}` : null;
}

/** Предложеният текст към хората; празен — картата не казва работа. */
export function testoProposto(scheda: ValoriScheda, day: string): string {
  const { sostituzione, installazione } = lavoriDi(scheda);
  if (sostituzione.length === 0 && installazione.length === 0) return '';
  const lavori = [
    sostituzione.length ? `sostituzione ${elenco(sostituzione)}` : '',
    installazione.length ? `installazione ${elenco(installazione)}` : '',
  ].filter(Boolean);
  const quando = giornoMese(day);
  const inizio = quando ? `Dal ${quando} l'impianto` : "L'impianto";
  return `${inizio} è fermo per lavori di ammodernamento: ${lavori.join('; ')}.`;
}

/** Част от сградата („Scala B“, „Palazzina 2“) — мястото на уредбата, не град. */
const PARTE_EDIFICIO =
  /^(scala|sc\.|palazzina|edificio|ed\.|torre|blocco|lotto|corpo|ingresso)\b/iu;

/**
 * „Via Roma 1, 20121 Milano (MI), Scala B“ → адрес „Via Roma 1“, град „Milano“, място „Scala B“. Без
 * запетая или без град — всичко е адрес. Отзад напред: първо частите на сградата, после градът.
 */
export function dividiIndirizzo(testo: string | null | undefined): {
  indirizzo: string;
  citta: string;
  ubicazione: string;
} {
  const parti = (testo ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
  const edificio: string[] = [];
  while (parti.length > 1 && PARTE_EDIFICIO.test(parti.at(-1)!)) edificio.unshift(parti.pop()!);
  const ubicazione = edificio.join(', ');
  if (parti.length < 2) return { indirizzo: parti.join(', '), citta: '', ubicazione };
  const coda = parti
    .at(-1)!
    .replace(/\(\s*[A-Za-z]{2}\s*\)/g, ' ')
    .replace(/\b\d{5}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Град е опашка с буква и без цифри („Sesto San Giovanni“); „12“, „12/A“, „int. 3“ са от адреса.
  if (!/\p{L}/u.test(coda) || /\d/.test(coda))
    return { indirizzo: parti.join(', '), citta: '', ubicazione };
  return { indirizzo: parti.slice(0, -1).join(', '), citta: coda, ubicazione };
}

/** Стойностите на новата табела от картата (и от предишната табела на същата уредба, ако има). */
export function valoriDaScheda(
  scheda: ValoriScheda & { indirizzo?: string | null },
  precedente: CartelloPrecedente | null,
  oggi: string,
): FormValues {
  const diviso = dividiIndirizzo(scheda.indirizzo);
  return {
    data: oggi,
    indirizzo: precedente?.indirizzo ?? diviso.indirizzo,
    citta: precedente ? (precedente.citta ?? '') : diviso.citta,
    ubicazione: precedente ? (precedente.ubicazione ?? '') : diviso.ubicazione,
    testo: testoProposto(scheda, oggi),
  };
}
