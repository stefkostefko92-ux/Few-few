import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  acroField,
  moduloSchema,
  overlayField,
  type Modulo,
  type ModuloAcro,
  type ModuloField,
  type ModuloOverlay,
} from './moduli-schema.js';

export * from './moduli-schema.js';

/**
 * Модулите на доставчиците — официалните им празни PDF-и (assets/moduli/) и картата на полетата им
 * (JSON до всеки PDF): кутийките и редовете на плоските листове в точки (Pelazza, листът с данни за
 * аргано, 2SG), имената на полетата във формуляра на MoviLift. Изходният PDF е самият празен лист с
 * нашите данни върху него — затова PDF-ът е закрепен по SHA-256: друга версия на модула значи други
 * координати, и процесът отказва да тръгне. Откъде е всеки празен модул — `fonte` в картата му
 * (MoviLift — копието без шифъра; листът за аргано — Word, конвертиран в PDF; двата листа на Mastech —
 * сканирани; трите на Elettroquadri — от сайта им, векторни; 2SG — начертан наново от нас по хартиения
 * им модул, `scripts/modulo-2sg.mjs`, който пише и координатите в картата — собственикът, 30 октомври
 * 2026: без сканирания лист).
 */

const ASSETS = new URL('../../assets/moduli/', import.meta.url);

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
/** AMI 100 — листовете с данните за поръчката, начертани от нас (scripts/moduli/ami100.mjs). */
export const AMI_UCM: ModuloOverlay = load(
  'ami100-mono-ucm.json',
  moduloSchema(overlayField, 'overlay'),
);
export const AMI_RTBS: ModuloOverlay = load(
  'ami100-mono-rtbs.json',
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
    AMI_UCM,
    AMI_RTBS,
  ])
    moduloPdf(modulo);
}

/** „Modulo ordine quadro (Scelta v2.6) · MoviLift“ — без доставчик само заглавието. */
export function nomeModulo(modulo: Pick<Modulo, 'titolo' | 'fornitore'>): string {
  return modulo.fornitore ? `${modulo.titolo} · ${modulo.fornitore}` : modulo.titolo;
}
