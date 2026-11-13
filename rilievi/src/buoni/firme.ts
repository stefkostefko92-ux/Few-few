import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { firmaSalvata, type Firma } from '../interventi/firma.js';
import { improntaFirma } from '../interventi/sigillo.js';
import type { BuonoData, ControlloBuono, RigaSequenza } from './form.js';
import { postoControllo, postoRiga, tipoPosto } from './posti.js';
import { CONTROLLO_KEYS, type ControlloKey } from './voci.js';

/**
 * Подписите на „Buono di lavoro“ — по избор и вързани за това, което подписват (собственикът, 12 ноември
 * 2026; без база — тества се само):
 * - подписът на ред с работа е за този ред (описание, изход, ден, доставчик), на проверка — за изхода и
 *   деня ѝ; подписите долу — за целия лист (всичко писано и подписите по редовете, без самите тях);
 * - подписаното не се сменя мълчаливо: промяна на подписан ред без „Togli la firma“ е грешка
 *   (`modificata`), а махнат подписан ред — `tolta`; докато има подпис долу, листът не се пише изобщо
 *   (service.ts — `chiuso`);
 * - еднакви щрихи на две места (в листа или в който и да е документ на портала — service.ts) — копиран
 *   подпис (`uguale` / `ripetuta`);
 * - всеки подпис носи печат (HMAC с INTERVENTI_SEAL_KEY, свой етикет) над листа, мястото, щрихите,
 *   подписаното, часа и кой го е взел — подпис, преместен или пипнат в базата, не минава за валиден.
 */

const sha = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const improntaRiga = (r: RigaSequenza): string =>
  sha(['rilievi/buono/riga/v1', r.id, r.descrizione, r.esito, r.data, r.fornitore]);

export const improntaControllo = (key: ControlloKey, c: ControlloBuono): string =>
  sha(['rilievi/buono/controllo/v1', key, c.esito, c.data]);

export interface FirmaHash {
  posto: string;
  hash: string;
}

/** Целият лист: всичко писано и подписите по редовете и проверките (по отпечатъка), без тези долу. */
export function improntaBuono(d: BuonoData, firme: readonly FirmaHash[]): string {
  return sha([
    'rilievi/buono/v1',
    d.numero,
    d.dataConferma,
    d.geometra,
    d.ordine,
    d.offerta,
    d.inizioPrevisto,
    d.finePrevista,
    d.matricola,
    d.ubicazione,
    d.pos,
    d.note,
    d.sequenze.map((r) => [r.id, r.descrizione, r.esito, r.data, r.fornitore]),
    CONTROLLO_KEYS.map((k) => [k, d.controlli[k].esito, d.controlli[k].data]),
    d.noteControlli,
    d.inizioLavori,
    d.inizioOra,
    d.fineLavori,
    d.fineOra,
    d.sospensioni,
    d.tecnici,
    firme
      .filter((f) => tipoPosto(f.posto) !== 'finale')
      .map((f) => [f.posto, f.hash])
      .sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
  ]);
}

/** Какво подписва мястото днес — или null, ако мястото вече го няма (махнат ред). */
export function improntaDelPosto(
  posto: string,
  d: BuonoData,
  firme: readonly FirmaHash[],
): string | null {
  const tipo = tipoPosto(posto);
  if (tipo === 'riga') {
    const riga = d.sequenze.find((r) => postoRiga(r.id) === posto);
    return riga ? improntaRiga(riga) : null;
  }
  if (tipo === 'controllo') {
    const key = CONTROLLO_KEYS.find((k) => postoControllo(k) === posto);
    return key ? improntaControllo(key, d.controlli[key]) : null;
  }
  return tipo === 'finale' ? improntaBuono(d, firme) : null;
}

export interface FirmaRegistrata extends FirmaHash {
  impronta: string;
}

export interface NuovaFirma extends FirmaHash {
  firma: Firma;
  impronta: string;
}

export type ErroreFirma = 'modificata' | 'tolta' | 'uguale';

export type PianoFirme =
  | { ok: true; togli: string[]; aggiungi: NuovaFirma[] }
  | { ok: false; errori: Record<string, ErroreFirma> };

/**
 * Какво става с подписите при записа. `ambito`: `lavoro` — формата (редовете и проверките; подписите
 * долу не се пипат и не трябва да ги има); `finali` — страницата на листа (само подписите долу, листът е
 * записаният). Подпис, пратен за чуждо на обхвата място, не се чете.
 */
export function pianoFirme(options: {
  ambito: 'lavoro' | 'finali';
  salvate: readonly FirmaRegistrata[];
  data: BuonoData;
  nuove: ReadonlyMap<string, Firma>;
  togli: ReadonlySet<string>;
}): PianoFirme {
  const { ambito, salvate, data } = options;
  const delAmbito = (posto: string) => {
    const tipo = tipoPosto(posto);
    return ambito === 'finali' ? tipo === 'finale' : tipo === 'riga' || tipo === 'controllo';
  };
  const errori: Record<string, ErroreFirma> = {};
  const togli = salvate.filter((f) => delAmbito(f.posto) && options.togli.has(f.posto));
  const restano = salvate.filter((f) => !togli.includes(f));

  if (ambito === 'lavoro') {
    for (const f of restano) {
      if (!delAmbito(f.posto)) continue;
      const ora = improntaDelPosto(f.posto, data, restano);
      if (ora === null) errori[f.posto] = 'tolta';
      else if (ora !== f.impronta) errori[f.posto] = 'modificata';
    }
  }

  // Новите — само на свободно място (подписаното се маха първо) и само с щрихи, които ги няма другаде.
  const occupati = new Set(restano.map((f) => f.posto));
  const visti = new Set(restano.map((f) => f.hash));
  const candidate: Array<{ posto: string; firma: Firma; hash: string }> = [];
  for (const [posto, firma] of options.nuove) {
    if (!delAmbito(posto) || occupati.has(posto)) continue;
    const hash = improntaFirma(firma);
    if (visti.has(hash)) {
      errori[posto] = 'uguale';
      continue;
    }
    visti.add(hash);
    candidate.push({ posto, firma, hash });
  }
  if (Object.keys(errori).length > 0) return { ok: false, errori };

  // Подписаното от новите — след всичко друго: подписите долу виждат и новите по редовете (няма ги
  // в `lavoro`, но редът е един и същ).
  const dopo: FirmaHash[] = [...restano, ...candidate];
  const aggiungi = candidate.map((c) => ({
    ...c,
    impronta: improntaDelPosto(c.posto, data, dopo) ?? '',
  }));
  return { ok: true, togli: togli.map((f) => f.posto), aggiungi };
}

export interface SigillabileFirma extends FirmaRegistrata {
  buonoId: string;
  firmatoAt: Date;
  firmatoDaId: string | null;
}

/** Печатът на подписа — само сървърът с ключа го прави. */
export function sigilloFirma(key: Buffer, f: SigillabileFirma): string {
  const canon = [
    'rilievi/buono/firma/v1',
    f.buonoId,
    f.posto,
    f.hash,
    f.impronta,
    f.firmatoAt.toISOString(),
    f.firmatoDaId,
  ];
  return createHmac('sha256', key).update(JSON.stringify(canon)).digest('hex');
}

export interface FirmaDelBuono extends SigillabileFirma {
  tratti: unknown;
  sigillo: string;
}

export interface StatoFirma {
  firma: Firma | null;
  /** Печатът, щрихите и подписаното съвпадат — подписът е за това, което листът казва днес. */
  valida: boolean;
  firmatoAt: Date;
  firmatoDaId: string | null;
}

/** Всеки подпис на листа с проверката му (страницата, PDF-ът, износът). */
export function statoFirme(
  key: Buffer,
  data: BuonoData,
  firme: readonly FirmaDelBuono[],
): Map<string, StatoFirma> {
  const out = new Map<string, StatoFirma>();
  for (const f of firme) {
    const firma = firmaSalvata(f.tratti);
    const atteso = Buffer.from(sigilloFirma(key, f), 'hex');
    const dato = Buffer.from(/^[0-9a-f]{64}$/.test(f.sigillo) ? f.sigillo : '', 'hex');
    const sigilloOk = dato.length === atteso.length && timingSafeEqual(dato, atteso);
    const valida =
      sigilloOk &&
      firma !== null &&
      improntaFirma(firma) === f.hash &&
      improntaDelPosto(f.posto, data, firme) === f.impronta;
    out.set(f.posto, { firma, valida, firmatoAt: f.firmatoAt, firmatoDaId: f.firmatoDaId });
  }
  return out;
}
