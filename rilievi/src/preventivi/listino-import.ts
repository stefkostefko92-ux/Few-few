import { createHash } from 'node:crypto';
import type { FieldErrorCode } from '../schede/field-parsers.js';
import { ALIQUOTE, isAliquota, type Aliquota } from './importi.js';
import { MAX_VOCI, parseVoce, type VoceData } from './listino.js';

/**
 * Ценоразписът наведнъж (собственикът, 13 ноември 2026 — „Нямаме listino prezzi, направи го от impostazioni за
 * да можем да правим preventivi по-бързо и лесно“): редовете се поставят от Excel (табулации) или от CSV
 * (точка и запетая, кавички) — със заглавен ред в какъвто и да е ред на колоните или без него в реда
 * „Codice; Descrizione; Unità; Prezzo; IVA“. Нищо не се гадае: цена, която не се чете, е грешка на реда си,
 * никога нула; без заглавен ред и с по-малко от четири колони не се решава коя е цената. Първо се показва какво
 * ще стане (нови и обновени редове), после се записва — всичко или нищо, в една транзакция
 * (listino-import-salva.ts). Тук е само четенето — без база. Цена от грешна колона не минава мълчаливо
 * (ревюто на Кодаджията, 13 ноември 2026): мерна единица, която е число, ред с повече клетки от колоните и
 * две колони за едно и също в заглавния ред са грешки.
 */

export const MAX_TESTO_IMPORT = 200_000;

/** Заглавният ред на износа — същите думи, които внасянето разпознава (файлът се връща обратно същият). */
export const INTESTAZIONE_LISTINO = [
  'Codice',
  'Descrizione',
  'Unità',
  'Prezzo €',
  'IVA %',
] as const;

/** Ред от ценоразписа като ред на CSV-то (цената — „1234,56“, без точка за хилядите). */
export const rigaCsvDi = (v: {
  codice: string | null;
  descrizione: string;
  unita: string;
  prezzo: number;
  iva: number;
}): string[] => [
  v.codice ?? '',
  v.descrizione,
  v.unita,
  (v.prezzo / 100).toFixed(2).replace('.', ','),
  String(v.iva),
];

export type ErroreImport = 'vuoto' | 'troppoLungo' | 'troppe' | 'colonne' | 'ambigue';
export type CampoImport = keyof VoceData;
export interface ErroreRiga {
  /** Номерът на реда в поставения текст (от 1; празните редове и заглавният се броят). */
  riga: number;
  campo: CampoImport;
  /** `numero` — мерна единица, която е число (разместени колони); `troppeColonne` — клетки отвъд колоните. */
  codice: FieldErrorCode | 'duplicato' | 'numero' | 'troppeColonne';
}
export interface RigaImport {
  riga: number;
  data: VoceData;
}
export interface LetturaImport {
  righe: RigaImport[];
  errori: ErroreRiga[];
  errore: ErroreImport | null;
  /** При `ambigue`: двете заглавия за едно и също поле („Costo, Prezzo“). */
  dettaglio: string | null;
  intestazione: boolean;
}

/**
 * Отпечатъкът на поставеното (текстът и двете стойности „когато липсва“): потвърждава се само прегледаното —
 * сменен след прегледа текст дава нов преглед, не запис.
 */
export const improntaImport = (testo: string, unita: string, iva: number): string =>
  createHash('sha256')
    .update(JSON.stringify([testo, unita, iva]))
    .digest('hex');

interface Record_ {
  riga: number;
  celle: string[];
}

/**
 * Редовете на текста с клетките им. Клетка в кавички може да носи разделителя, нов ред и „""“ за кавичка
 * (така пишат Excel и нашият износ); редът се брои от мястото, където започва.
 */
function tabella(testo: string, sep: string): Record_[] {
  const righe: Record_[] = [];
  let celle: string[] = [];
  let cella = '';
  let linea = 1;
  let inizio = 1;
  let traVirgolette = false;
  const chiudi = (): void => {
    celle.push(cella);
    if (celle.some((c) => c.trim() !== '')) righe.push({ riga: inizio, celle });
    celle = [];
    cella = '';
  };
  for (let i = 0; i < testo.length; i += 1) {
    const c = testo[i]!;
    if (traVirgolette) {
      if (c === '"' && testo[i + 1] === '"') {
        cella += '"';
        i += 1;
      } else if (c === '"') traVirgolette = false;
      else {
        if (c === '\n') linea += 1;
        cella += c;
      }
    } else if (c === '"' && cella.trim() === '') {
      // Кавичката отваря клетка и след интервал („; "Porta; 2 ante"“).
      cella = '';
      traVirgolette = true;
    } else if (c === sep) {
      celle.push(cella);
      cella = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i += 1;
      chiudi();
      linea += 1;
      inizio = linea;
    } else cella += c;
  }
  chiudi();
  return righe;
}

/** Разделителят: табулация, ако първият ред с текст има такава извън кавички (копирано от таблица), иначе „;“. */
function separatore(testo: string): string {
  let traVirgolette = false;
  let visto = false;
  for (const c of testo) {
    if (c === '"') traVirgolette = !traVirgolette;
    else if (!traVirgolette && c === '\t') return '\t';
    else if (!traVirgolette && (c === '\n' || c === '\r')) {
      if (visto) return ';';
    } else if (c.trim() !== '') visto = true;
  }
  return ';';
}

const COLONNE: Readonly<Record<CampoImport, readonly string[]>> = {
  codice: ['codice', 'cod', 'codicearticolo', 'articolo', 'art'],
  descrizione: ['descrizione', 'descr', 'descrizionearticolo', 'voce', 'lavorazione'],
  unita: ['unita', 'um', 'udm', 'unitadimisura', 'unitamisura'],
  prezzo: ['prezzo', 'prezzounitario', 'prezzolistino', 'prezzoeuro', 'costo', 'importo'],
  iva: ['iva', 'aliquota', 'aliquotaiva'],
};
const ORDINE: readonly CampoImport[] = ['codice', 'descrizione', 'unita', 'prezzo', 'iva'];

/** „Prezzo €“ → „prezzo“, „Unità“ → „unita“: само буквите, без ударения. */
const parola = (cella: string): string =>
  cella
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * Кой номер колона е всяко поле, ако редът е заглавен (има и описание, и цена); иначе null. Две заглавия за
 * едно и също поле („Costo“ и „Prezzo“) не се решават мълчаливо — връщат се двете имена.
 */
function intestazioneDi(
  celle: string[],
): { colonne: Partial<Record<CampoImport, number>> } | { ambigue: string } | null {
  const colonne: Partial<Record<CampoImport, number>> = {};
  let ambigue: string | null = null;
  celle.forEach((cella, i) => {
    const nome = parola(cella);
    const campo = ORDINE.find((c) => COLONNE[c].includes(nome));
    if (!campo) return;
    const prima = colonne[campo];
    if (prima === undefined) colonne[campo] = i;
    else ambigue ??= `${celle[prima]!.trim()}, ${cella.trim()}`;
  });
  if (colonne.descrizione === undefined || colonne.prezzo === undefined) return null;
  return ambigue === null ? { colonne } : { ambigue };
}

/** Мерна единица само от цифри и знаци на число не е мерна единица — колоните са разместени. */
const sembraNumero = (cella: string): boolean => /^[\d\s.,%€+-]+$/.test(cella);

/** Апострофът, който износът слага пред клетка, започваща като формула, не е част от стойността. */
const senzaApostrofo = (cella: string): string =>
  /^'[=+\-@\t\r]/.test(cella) ? cella.slice(1) : cella;

/** „22“, „22 %“, „0,22“ (клетка в проценти) → ставката; празно — тази от формата; друго — null. */
function ivaDi(cella: string, predefinita: Aliquota): Aliquota | null {
  const s = cella.replace(/[\s%]/g, '').replace(',', '.');
  if (s === '') return predefinita;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  // „0,22“ е 22 %, но „0,215“ не е ставка — дробта се приема само когато е точно цял процент.
  const cento = Math.round(n * 100);
  const percento = n > 0 && n < 1 && Math.abs(n * 100 - cento) < 1e-9 ? cento : n;
  return isAliquota(percento) ? percento : null;
}

export function leggiImport(
  testo: string,
  predefiniti: { unita: string; iva: Aliquota },
): LetturaImport {
  const niente = (errore: ErroreImport, dettaglio: string | null = null): LetturaImport => ({
    righe: [],
    errori: [],
    errore,
    dettaglio,
    intestazione: false,
  });
  if (testo.length > MAX_TESTO_IMPORT) return niente('troppoLungo');
  const pulito = testo.replace(/^\uFEFF/, '');
  const tutte = tabella(pulito, separatore(pulito));
  if (tutte.length === 0) return niente('vuoto');
  const titoli = intestazioneDi(tutte[0]!.celle);
  if (titoli && 'ambigue' in titoli) return niente('ambigue', titoli.ambigue);
  const intestazione = titoli !== null;
  const corpo = intestazione ? tutte.slice(1) : tutte;
  if (corpo.length === 0) return { ...niente('vuoto'), intestazione };
  // Без заглавен ред колоните са в описания ред — с по-малко от четири няма как да се знае коя е цената.
  if (!intestazione && Math.max(...corpo.map((r) => r.celle.length)) < 4) return niente('colonne');
  if (corpo.length > MAX_VOCI) return { ...niente('troppe'), intestazione };
  const colonne = titoli?.colonne ?? { codice: 0, descrizione: 1, unita: 2, prezzo: 3, iva: 4 };
  const larghezza = intestazione ? tutte[0]!.celle.length : ORDINE.length;
  const cella = (record: Record_, campo: CampoImport): string => {
    const i = colonne[campo];
    return i === undefined ? '' : senzaApostrofo(record.celle[i] ?? '').trim();
  };
  const righe: RigaImport[] = [];
  const errori: ErroreRiga[] = [];
  const codici = new Set<string>();
  for (const record of corpo) {
    // Клетки отвъд колоните: „;“ в текст без кавички е разместил всичко след себе си — редът не се чете.
    if (record.celle.slice(larghezza).some((c) => c.trim() !== '')) {
      errori.push({ riga: record.riga, campo: 'descrizione', codice: 'troppeColonne' });
      continue;
    }
    const iva = ivaDi(cella(record, 'iva'), predefiniti.iva);
    const unita = cella(record, 'unita');
    const parsed = parseVoce({
      codice: cella(record, 'codice'),
      descrizione: cella(record, 'descrizione'),
      unita: unita || predefiniti.unita,
      prezzo: cella(record, 'prezzo'),
      iva: String(iva ?? ALIQUOTE[0]),
    });
    const sbagliati: ErroreRiga[] = parsed.ok
      ? []
      : ORDINE.filter((campo) => parsed.errors[campo]).map((campo) => ({
          riga: record.riga,
          campo,
          codice: parsed.errors[campo]!,
        }));
    if (sembraNumero(unita) && !sbagliati.some((e) => e.campo === 'unita'))
      sbagliati.push({ riga: record.riga, campo: 'unita', codice: 'numero' });
    if (iva === null) sbagliati.push({ riga: record.riga, campo: 'iva', codice: 'option' });
    if (parsed.ok && sbagliati.length === 0) {
      const codice = parsed.data.codice;
      if (codice !== null && codici.has(codice))
        sbagliati.push({ riga: record.riga, campo: 'codice', codice: 'duplicato' });
      else {
        if (codice !== null) codici.add(codice);
        righe.push({ riga: record.riga, data: parsed.data });
      }
    }
    errori.push(...sbagliati);
  }
  return { righe, errori, errore: null, dettaglio: null, intestazione };
}
