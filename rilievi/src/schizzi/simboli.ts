/**
 * Готовите символи на скицника за шахтата (собственикът, 23 октомври 2026) — в план: всеки е в своя
 * кутия 100 × 100, която при поставянето се разпъва до ширината и височината му и се завърта на 90°.
 * Пътищата са в граматиката на листа („M x y“, относителни „l“, „z“ — src/schizzi/elementi.ts), кръговете —
 * център и радиуси. Отива в браузъра с VISTA_SCHIZZO и се рисува еднакво в картата, печата и PDF-а
 * (src/schizzi/forme.ts, public/js/schizzo-forme.js).
 */

/** Път в кутията или кръг/елипса — център и радиуси; `solido` — никога на пунктир (малките кръгове). */
export type ParteSimbolo =
  { d: string } | { e: readonly [number, number, number, number]; solido?: true };

export interface Simbolo {
  /** Размерът при докосване без теглене — в единиците на листа (шахта, нарисувана ~900 × 700). */
  readonly misura: readonly [number, number];
  /** Разпъва се само пропорционално — иначе кръгът става елипса, а Т профилът — нещо друго. */
  readonly proporzionale?: true;
  readonly parti: readonly ParteSimbolo[];
}

const RETTANGOLO = 'M0 0l100 0l0 100l-100 0z';
const STIPITI = [{ d: 'M0 30l12 0l0 40l-12 0z' }, { d: 'M88 30l12 0l0 40l-12 0z' }] as const;

export const SIMBOLI = {
  // Кабината — с двойна стена.
  cabina: { misura: [500, 400], parti: [{ d: RETTANGOLO }, { d: 'M8 8l84 0l0 84l-84 0z' }] },
  // Противотежестта — правоъгълник с кръст.
  contrappeso: {
    misura: [300, 80],
    parti: [{ d: RETTANGOLO }, { d: 'M0 0l100 100' }, { d: 'M100 0l-100 100' }],
  },
  // Водачът — Т профил: петата към стената, главата към кабината.
  guida: {
    misura: [50, 50],
    proporzionale: true,
    parti: [{ d: 'M0 0l100 0l0 30l-38 0l0 70l-24 0l0 -70l-38 0z' }],
  },
  // Телескопична (автоматична) врата, отваряне встрани: двете каси и две крила едно зад друго.
  porta: {
    misura: [400, 70],
    parti: [...STIPITI, { d: 'M12 36l44 0l0 10l-44 0z' }, { d: 'M44 54l44 0l0 10l-44 0z' }],
  },
  // Автоматична врата с централно отваряне: двете крила се срещат в средата.
  centrale: {
    misura: [400, 70],
    parti: [...STIPITI, { d: 'M12 44l38 0l0 12l-38 0z' }, { d: 'M50 44l38 0l0 12l-38 0z' }],
  },
  // Врата хармоника (стари уредби): касите и сгънатото крило на зигзаг.
  soffietto: {
    misura: [300, 60],
    parti: [
      { d: 'M0 30l10 0l0 40l-10 0z' },
      { d: 'M90 30l10 0l0 40l-10 0z' },
      { d: 'M10 50l10 -16l10 32l10 -32l10 32l10 -32l10 32l10 -32l10 16' },
    ],
  },
  // Врата на панта (ръчна): крилото отворено на 90° и пътят му — четвърт окръжност на отсечки.
  battente: {
    misura: [300, 300],
    proporzionale: true,
    parti: [
      { d: 'M0 100l0 -100' },
      { d: 'M0 0l13 1l13 2l12 5l12 5l11 8l10 8l8 10l8 11l5 12l5 12l2 13l1 13' },
    ],
  },
  // Бутониерата в план — кутия на стената с три бутона (кръгли при размера по подразбиране, 2 : 1).
  bottoniera: {
    misura: [60, 30],
    parti: [
      { d: RETTANGOLO },
      { e: [25, 50, 8, 16], solido: true },
      { e: [50, 50, 8, 16], solido: true },
      { e: [75, 50, 8, 16], solido: true },
    ],
  },
  // Буталото на хидравличната уредба — цилиндър с прът.
  pistone: {
    misura: [120, 120],
    proporzionale: true,
    parti: [{ e: [50, 50, 50, 50] }, { e: [50, 50, 22, 22], solido: true }],
  },
} as const satisfies Record<string, Simbolo>;

export type NomeSimbolo = keyof typeof SIMBOLI;
export const NOMI_SIMBOLI = Object.keys(SIMBOLI) as [NomeSimbolo, ...NomeSimbolo[]];
