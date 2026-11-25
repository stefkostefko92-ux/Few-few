/**
 * Асансьорът по D.M. 236/1989 (наредбата по чл. 1 на L. 13/1989), т. 8.1.12 — мерките като константи и
 * проверка на измерена кабина. Законът се цитира свободно; стойностите са от
 * research/norme-ascensori/leggi/dm-236-1989.md:403-421. В mm (цели числа — без грешки от запетаята).
 *
 * Картата още няма мерките на кабината (собственикът решава дали да ги пита) — затова проверката е отделна;
 * отметката „DM 236 (Legge 13)“ в модулите на таблата (src/ordini/collegamenti-quadri.ts, `legge13`) не
 * проверява мерки. Съответствието на конкретния асансьор решава проектантът.
 */

export type CategoriaDm236 = 'a' | 'b' | 'c';

export interface CabinaDm236 {
  profonditaMm: number;
  larghezzaMm: number;
  /** Светъл отвор на вратата на късата страна. */
  portaLuceMm: number;
  /** Площадката пред вратата на кабината — квадрат с тази страна. */
  piattaformaMm: number;
}

/**
 * 8.1.12 а) нови нежилищни сгради; б) нови жилищни сгради; в) приспособяване на съществуващи сгради — само ако
 * по-голяма кабина не може да се монтира (dm-236-1989.md:403-410).
 */
export const CABINA_DM236: Readonly<Record<CategoriaDm236, CabinaDm236>> = {
  a: { profonditaMm: 1400, larghezzaMm: 1100, portaLuceMm: 800, piattaformaMm: 1500 },
  b: { profonditaMm: 1300, larghezzaMm: 950, portaLuceMm: 800, piattaformaMm: 1500 },
  c: { profonditaMm: 1200, larghezzaMm: 800, portaLuceMm: 750, piattaformaMm: 1400 },
};

/** 8.1.12 вратите: отворени поне 8 s, затваряне не по-малко от 4 s (dm-236-1989.md:411-413). */
export const PORTE_DM236 = { apertaMinS: 8, chiusuraMinS: 4 } as const;

/** 8.1.12 спирането: самонивелиране с отклонение до ± 2 cm (dm-236-1989.md:414). */
export const LIVELLAMENTO_DM236_MAX_MM = 20;

/**
 * 8.1.12 бутониерите: най-високият бутон между 1,10 и 1,40 m; вътрешната — на страничната стена, поне 35 cm
 * от вратата на кабината (dm-236-1989.md:415-416).
 */
export const BOTTONIERA_DM236 = {
  altezzaMinMm: 1100,
  altezzaMaxMm: 1400,
  dallaPortaMinMm: 350,
} as const;

/** 8.1.12 в кабината: домофон на 1,10–1,30 m, аварийна светлина поне 3 h (dm-236-1989.md:419-420). */
export const CABINA_DOTAZIONI_DM236 = {
  citofonoMinMm: 1100,
  citofonoMaxMm: 1300,
  luceEmergenzaMinH: 3,
} as const;

export type VoceCabinaDm236 = 'profondita' | 'larghezza' | 'portaLuce' | 'piattaforma';

export interface EsitoDm236 {
  voce: VoceCabinaDm236;
  richiestoMm: number;
  misuratoMm: number | null;
  /** `ok` — поне колкото иска 8.1.12; `no` — по-малко; `manca` — не е измерено. */
  esito: 'ok' | 'no' | 'manca';
}

/**
 * Измерената кабина спрямо категорията: всяка мярка е „поне“ (≥). Площадката се мери по по-късата си страна.
 * Липсващото е `manca` — никога „ok“.
 */
export function verificaCabinaDm236(
  categoria: CategoriaDm236,
  misure: {
    profonditaMm?: number | null;
    larghezzaMm?: number | null;
    portaLuceMm?: number | null;
    piattaformaMm?: number | null;
  },
): EsitoDm236[] {
  const richiesto = CABINA_DM236[categoria];
  const voci: ReadonlyArray<[VoceCabinaDm236, number, number | null | undefined]> = [
    ['profondita', richiesto.profonditaMm, misure.profonditaMm],
    ['larghezza', richiesto.larghezzaMm, misure.larghezzaMm],
    ['portaLuce', richiesto.portaLuceMm, misure.portaLuceMm],
    ['piattaforma', richiesto.piattaformaMm, misure.piattaformaMm],
  ];
  return voci.map(([voce, richiestoMm, valore]) => {
    const misuratoMm = typeof valore === 'number' && Number.isFinite(valore) ? valore : null;
    const esito = misuratoMm === null ? 'manca' : misuratoMm >= richiestoMm ? 'ok' : 'no';
    return { voce, richiestoMm, misuratoMm, esito };
  });
}
