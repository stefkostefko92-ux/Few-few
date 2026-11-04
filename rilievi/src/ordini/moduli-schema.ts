import { z } from 'zod';

/**
 * Картата на модул (JSON до всеки празен PDF в assets/moduli/) — проверката ѝ при старт: плоските листове
 * (кутийки, редове и полета за текст в точки, от горе) и формулярите (имената на полетата в PDF-а).
 * Зарежда ги moduli.ts.
 */

/**
 * Откъде идва предварителната стойност на поле, което не е в никоя връзка (src/ordini/prefill.ts и
 * public/js/moduli.js — там тя следва картата и докато се пише): датата, препратката към асансьора,
 * фирмата и човекът, които пишат, и отметките на картата като думи. Данните на уредбата, които стоят
 * на няколко места (спирки, адрес, врати, товар, въжета…), са в src/ordini/collegamenti-elenco.ts —
 * попълват се във всички посоки и се сравняват.
 */
export const PREFILL_TOKENS = [
  'data',
  'rif',
  'azienda',
  'utente',
  'ruolo',
  'email',
  // Отметките на картата като думи („Automatiche, Manuali“, „Alto“) — за текстово поле на модул.
  'tipoImpianto',
  'tipoPorte',
  'ubicazioneMacchina',
] as const;
export type PrefillToken = (typeof PREFILL_TOKENS)[number];

/** Отметка от огледа: „поле=СТОЙНОСТ“ (шейна за смяна: Sì → „Elettr. Pattino“ на MoviLift). */
const CHECK_PREFILL = /^pattinoRetrattile=si$/;

const num = z.number().finite();
const base = {
  key: z.string().regex(/^[a-z][A-Za-z0-9]{1,40}$/),
  label: z.string().min(1).max(120),
  /** На хартията полето няма свой етикет (стойност до отметка) — на екрана етикетът е скрит. */
  labelNascosta: z.literal(true).optional(),
};
const checkPrefill = z.string().regex(CHECK_PREFILL).optional();
const textPrefill = z.enum(PREFILL_TOKENS).optional();
const maxLength = z.number().int().min(1).max(600);
/** Същата стойност и на тези страници, на същото място (главата на Elettroquadri се повтаря на стр. 2). */
const anche = z.array(z.number().int().min(2).max(4)).min(1).optional();

const overlayField = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('check'),
    prefill: checkPrefill,
    /** Вътрешността на кутийката: x0, y0 (от горе), x1, y1 — в точки. */
    box: z.tuple([num, num, num, num]),
    anche,
    /** Кръгче около надписа вместо кръстче — етажите на NG120 се отбелязват по номера си. */
    segno: z.literal('cerchio').optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    /** Редът: от x0 до x1, върху линията на височина y (от горе). */
    line: z.tuple([num, num, num]),
    anche,
  }),
  z.object({
    ...base,
    kind: z.literal('textarea'),
    prefill: textPrefill,
    maxLength,
    area: z.tuple([num, num, num, num]),
    /** Листът има свои редове (пунктир) в кутията: текстът се пише върху тях — височините им. */
    righe: z.array(num).min(2).optional(),
    anche,
  }),
]);

/**
 * Във формуляр: отметка, текст, радио група (опциите — по реда на бутоните ѝ в PDF-а, `widget`) и
 * падащ списък (`vuoto` е опцията „нищо избрано“, напр. „SCEGLI...“). `predefinito` е стойността на
 * празния модул — с нея модулът се отваря, ако нищо друго не го попълни.
 */
const acroField = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('check'),
    prefill: checkPrefill,
    acro: z.string().min(1),
    predefinito: z.literal(true).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    acro: z.string().min(1),
    predefinito: z.string().min(1).optional(),
    /**
     * Полето има бутон и на чуждо място (грешка в модула: „Fossa“ на MoviLift е и в първата кутийка на
     * „Piano Corto“) — на листа излиза само този бутон.
     */
    widget: z.number().int().min(0).optional(),
    /**
     * Полето го няма във формуляра, а листът го чака („Fotocellula … V“ на MoviLift): създава се при
     * попълването — x, y (от долу), ширина и височина в точки, на страницата на полето `come`, с неговия
     * шрифт, размер и цвят (pdf-form.ts).
     */
    crea: z.object({ rect: z.tuple([num, num, num, num]), come: z.string().min(1) }).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('textarea'),
    prefill: textPrefill,
    maxLength,
    acro: z.string().min(1),
  }),
  z.object({
    ...base,
    kind: z.literal('radio'),
    acro: z.string().min(1),
    opzioni: z
      .array(
        z.object({
          valore: z.string().regex(/^[a-z][A-Za-z0-9]{0,30}$/),
          label: z.string().min(1).max(120),
          widget: z.number().int().min(0),
        }),
      )
      .min(2),
    predefinito: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('select'),
    prefill: textPrefill,
    acro: z.string().min(1),
    opzioni: z.array(z.string().min(1).max(60)).min(1),
    vuoto: z.string().min(1),
  }),
]);

function moduloSchema<F extends z.ZodTypeAny, T extends string>(field: F, tipo: T) {
  return z.object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    /** Доставчикът („Pelazza Peppino“); листът за аргано е за всеки вид — без доставчик. */
    fornitore: z.string().min(1).optional(),
    titolo: z.string().min(1),
    /** Откъде е празният модул: адресът при доставчика или как е дошъл (качен от собственика). */
    fonte: z.string().min(1),
    file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    tipo: z.literal(tipo),
    /** Плоските листове: размерът на написаното (по подразбиране 8 pt) и колко над линията стои. */
    dimensione: z.number().min(5).max(20).optional(),
    sopraLinea: z.number().min(0).max(5).optional(),
    gruppi: z.array(
      z.object({
        titolo: z.string().min(1),
        /** Страницата на листа, на която е групата (QI Touch е на две); без нея — първата. */
        pagina: z.number().int().min(1).max(4).optional(),
        righe: z.array(
          z.object({
            /**
             * Надписът на реда на листа („Norme di riferimento“), когато отметките сами не казват за
             * какво са („6V“, „12V“): във формата е пред тях, в резюмето — пред всяка.
             */
            titolo: z.string().min(1).max(80).optional(),
            campi: z.array(field).min(1),
            /** Стрелката от хартията: след толкова полета от реда. */
            freccia: z.number().int().min(1).optional(),
          }),
        ),
      }),
    ),
  });
}

export type OverlayField = z.output<typeof overlayField>;
export type AcroField = z.output<typeof acroField>;
export type ModuloField = OverlayField | AcroField;
export type ModuloOverlay = z.output<
  ReturnType<typeof moduloSchema<typeof overlayField, 'overlay'>>
>;
export type ModuloAcro = z.output<ReturnType<typeof moduloSchema<typeof acroField, 'acroform'>>>;
export type Modulo = ModuloOverlay | ModuloAcro;

export { overlayField, acroField, moduloSchema };
