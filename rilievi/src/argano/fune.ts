import type { DatiArgano } from './dati.js';
import { numero } from './formato.js';
import { funeDi, type Fune } from './tabelle.js';

/**
 * Въжето за тяга като данни за показване (собственикът, 2 ноември 2026 — „manca la cordatura, classe e
 * formazione … migliorare anche nella funzione di scelta“): от таблиците TELCAL/DONATI на „RT-E MOD
 * 10411-1“ (формация, нишки, клас — дословно от файла) или написаното на ръка при `altro`, плюс
 * „cordatura“ — каквато е избрана (таблиците на файла я нямат). Изчислението не я чете: тя е данни за
 * релацията, като формацията и класа.
 */

/** Посоката на усукване по EN 12385-2: кръстосано (crociata) и успоредно (Lang) — дясно и ляво. */
export const CORDATURE = ['sZ', 'zS', 'zZ', 'sS'] as const;
export type Cordatura = (typeof CORDATURE)[number];

/** Класът на якост на телта в N/mm² — единичен („1570“) или двоен („1370/1770“), без интервали. */
export const CLASSE = /^\d{3,4}(\/\d{3,4})?$/;

/** „6*19S + FC = 114 fili“ → „6×19S + FC, 114 fili“; `breve` — без броя на телта. */
export function formazioneLeggibile(formazione: string, breve = false): string {
  const [testa = '', fili] = formazione.split(' = ');
  const nome = testa.replaceAll('*', '×').trim();
  return breve || !fili ? nome : `${nome}, ${fili.trim()}`;
}

export interface CaratteristicheFune {
  /** Производителят от таблиците; null — въже, написано на ръка. */
  marca: Fune['marca'] | null;
  d: number;
  trefoli: number | null;
  formazione: string | null;
  classe: string | null;
  cordatura: Cordatura | null;
  /** mm² */
  sezione: number;
  /** N */
  rottura: number;
  /** kg/m */
  massa: number;
}

export function caratteristicheFune(d: DatiArgano): CaratteristicheFune {
  const cordatura = d.funeCordatura ?? null;
  const tabella = d.fune === 'altro' ? undefined : funeDi(d.fune);
  if (tabella)
    return {
      marca: tabella.marca,
      d: tabella.d,
      trefoli: tabella.trefoli,
      formazione: formazioneLeggibile(tabella.formazione),
      classe: tabella.classe,
      cordatura,
      sezione: tabella.sezione,
      rottura: tabella.rottura,
      massa: tabella.massa,
    };
  const a = d.funeAltro!;
  return {
    marca: null,
    d: a.d,
    trefoli: a.trefoli ?? null,
    formazione: a.formazione ?? null,
    classe: a.classe ?? null,
    cordatura,
    sezione: a.sezione,
    rottura: a.rottura,
    massa: a.massa,
  };
}

/** Надписът на въже от таблиците в избора: „Ø 10 mm · 6×19 + FC“ (производителят е групата). */
export const etichettaFune = (f: Fune): string =>
  `Ø ${numero(f.d, 0)} mm · ${formazioneLeggibile(f.formazione, true)}`;

/** Данните на въже от таблиците, както ги показва картата под избора (и скриптът ѝ). */
export const datiFune = (f: Fune): Record<string, string> => ({
  formazione: formazioneLeggibile(f.formazione),
  trefoli: String(f.trefoli),
  classe: `${f.classe} N/mm²`,
  sezione: `${numero(f.sezione, f.sezione % 1 ? 1 : 0)} mm²`,
  rottura: `${numero(f.rottura, 0)} N`,
  massa: `${numero(f.massa, 2)} kg/m`,
});
