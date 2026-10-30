import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Модулите на доставчиците — официалните им празни PDF-и (assets/moduli/) и картата на полетата им
 * (JSON до всеки PDF): кутийките и редовете на плоските листове в точки (Pelazza, листът с данни за
 * аргано, 2SG), имената на полетата във формуляра на MoviLift. Изходният PDF е самият оригинал с нашите
 * данни върху него — затова PDF-ът е закрепен по SHA-256: друга версия на модула значи други
 * координати, и процесът отказва да тръгне. Откъде е всеки празен модул — `fonte` в картата му
 * (MoviLift — копието без шифъра; листът за аргано — Word, конвертиран в PDF; 2SG и двата листа на
 * Mastech — сканирани; трите на Elettroquadri — от сайта им, векторни).
 */

const ASSETS = new URL('../../assets/moduli/', import.meta.url);

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
    /** Сканираният лист е обърнат: страницата се завърта, за да излезе изправена (2SG). */
    ruota: z.literal(180).optional(),
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

function load<S extends z.ZodTypeAny>(name: string, schema: S): z.output<S> {
  const map: z.output<S> = schema.parse(JSON.parse(readFileSync(new URL(name, ASSETS), 'utf8')));
  const fields = fieldsOf(map as Modulo);
  const keys = fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${name}: повтарящ се ключ на поле`);
  for (const field of fields) {
    if (field.kind === 'radio') {
      const valori = field.opzioni.map((o) => o.valore);
      const widgets = field.opzioni.map((o) => o.widget);
      const ok =
        new Set(valori).size === valori.length &&
        new Set(widgets).size === widgets.length &&
        (field.predefinito === undefined || valori.includes(field.predefinito));
      if (!ok) throw new Error(`${name}: радио ${field.key} не е цяло`);
    }
    if (field.kind === 'text' && 'predefinito' in field && field.predefinito !== undefined) {
      if (field.predefinito.length > field.maxLength)
        throw new Error(`${name}: ${field.key} е дълго`);
    }
  }
  return map;
}

/** Полетата на модула в реда на документа. */
export function fieldsOf(modulo: Modulo): ModuloField[] {
  return modulo.gruppi.flatMap((g) => g.righe.flatMap((r): ModuloField[] => r.campi));
}

export const PELAZZA: ModuloOverlay = load(
  'pelazza-ordine-quadri-032026.json',
  moduloSchema(overlayField, 'overlay'),
);
export const ARGANI: ModuloOverlay = load(
  'rilievo-dati-argani.json',
  moduloSchema(overlayField, 'overlay'),
);
export const MOVILIFT: ModuloAcro = load(
  'movilift-modulo-ordine-scelta-v2-6.json',
  moduloSchema(acroField, 'acroform'),
);
export const SG: ModuloOverlay = load(
  '2sg-ordine-porte.json',
  moduloSchema(overlayField, 'overlay'),
);
export const MASTECH_NG120: ModuloOverlay = load(
  'mastech-ng120.json',
  moduloSchema(overlayField, 'overlay'),
);
export const MASTECH_QI: ModuloOverlay = load(
  'mastech-qi-touch.json',
  moduloSchema(overlayField, 'overlay'),
);
/** Elettroquadri: модулът се избира по вида на уредбата (registry.ts) — електрическа, MRL, хидравлична. */
export const EQ_GEARED: ModuloOverlay = load(
  'elettroquadri-geared.json',
  moduloSchema(overlayField, 'overlay'),
);
export const EQ_GEARLESS: ModuloOverlay = load(
  'elettroquadri-gearless.json',
  moduloSchema(overlayField, 'overlay'),
);
export const EQ_OLEO: ModuloOverlay = load(
  'elettroquadri-oleodinamico.json',
  moduloSchema(overlayField, 'overlay'),
);

const bytes = new Map<string, Uint8Array>();

/** Празният официален PDF — проверен по SHA-256 (при старт, после от паметта). */
export function moduloPdf(modulo: Modulo): Uint8Array {
  const cached = bytes.get(modulo.id);
  if (cached) return cached;
  const data = readFileSync(new URL(modulo.file, ASSETS));
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== modulo.sha256) {
    throw new Error(`${modulo.file}: друга версия на модула (SHA-256 ${sha}) — картата не пасва`);
  }
  const copy = new Uint8Array(data);
  bytes.set(modulo.id, copy);
  return copy;
}

/** Проверка при старт: модулите са на мястото си и са точно версията на картите. */
export function assertModuli(): void {
  for (const modulo of [
    PELAZZA,
    MOVILIFT,
    ARGANI,
    SG,
    MASTECH_NG120,
    MASTECH_QI,
    EQ_GEARED,
    EQ_GEARLESS,
    EQ_OLEO,
  ])
    moduloPdf(modulo);
}

/** „Modulo ordine quadro (Scelta v2.6) · MoviLift“ — без доставчик само заглавието. */
export function nomeModulo(modulo: Pick<Modulo, 'titolo' | 'fornitore'>): string {
  return modulo.fornitore ? `${modulo.titolo} · ${modulo.fornitore}` : modulo.titolo;
}
