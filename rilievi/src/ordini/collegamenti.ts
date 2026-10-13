import { fieldByKey } from '../schede/fields.js';
import { fieldsOf, type ModuloField } from './moduli.js';
import { SLOTS, type Prefisso } from './registry.js';
import { nameOf } from './valori.js';

/**
 * Свързаните данни — СПИСЪКЪТ: едно и също нещо от уредбата, записано на повече от едно място — в
 * картата, в поръчката за таблото (Pelazza, `oq`) и в запитването за аргано (Montanari, `pa`).
 * Правилата върху него (попълване, разминавания) са в collegati.ts; същият списък стига до браузъра
 * като JSON и public/js/collegati.js прави същото, докато се пише.
 */

export type Luogo = 'scheda' | Prefisso;

/** Число или текст с числа („1,0“, „400 V“). `valori` превежда отговор от картата („si“ → „2“). */
export type MembroNumero =
  | { luogo: 'scheda'; campo: string; valori?: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo: string };

/** Отметки: коя отметка (стойност от картата или ключ на модула) коя категория е. */
export type MembroScelta =
  | { luogo: 'scheda'; campo: string; voci: Readonly<Record<string, string>> }
  | { luogo: Prefisso; voci: Readonly<Record<string, string>> };

export type Collegamento =
  | { key: string; tipo: 'numero'; membri: readonly MembroNumero[] }
  | { key: string; tipo: 'scelta'; membri: readonly MembroScelta[] };

/**
 * Редът на местата е и редът на попълването: първо картата, после таблото, после аргано. Решено със
 * собственика (октомври 2026): спирките, скоростта и нейният вид, ходът, товарът, нормата, напрежението
 * на мотора и на спирачката — плюс досегашното попълване от картата (врати, достъпи, шейни, място на
 * машината, въжета).
 */
export const COLLEGAMENTI: readonly Collegamento[] = [
  {
    key: 'fermate',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'fermate' },
      { luogo: 'oq', campo: 'nFermate' },
      { luogo: 'pa', campo: 'fermate' },
    ],
  },
  {
    key: 'velocita',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'velocita' },
      { luogo: 'pa', campo: 'velocita' },
    ],
  },
  {
    // Табло „1/2 Velocità, VVVF“ ↔ двигател на аргано AC1/AC2/VVVF.
    key: 'tipoVelocita',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'oq',
        voci: { tq1Velocita: '1V', tq2Velocita: '2V', tqVvvfAperto: 'VVVF', tqVvvfChiuso: 'VVVF' },
      },
      { luogo: 'pa', voci: { ac1: '1V', ac2: '2V', vvvf: 'VVVF' } },
    ],
  },
  {
    key: 'corsa',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'corsa' },
      { luogo: 'pa', campo: 'corsa' },
    ],
  },
  {
    key: 'portata',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'portataKg' },
      { luogo: 'pa', campo: 'portata' },
    ],
  },
  {
    // EN 81-1 е само при Montanari: таблото по EN 81-20 и аргано по EN 81-1 са разминаване.
    key: 'norma',
    tipo: 'scelta',
    membri: [
      { luogo: 'oq', voci: { normaEn8120: 'EN81-20' } },
      { luogo: 'pa', voci: { normaEn8120: 'EN81-20', normaEn811: 'EN81-1' } },
    ],
  },
  {
    key: 'tensioneMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motVca' },
      { luogo: 'pa', campo: 'motoreVoltaggio' },
    ],
  },
  {
    key: 'tensioneFreno',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'circuitoFrenoVcc' },
      { luogo: 'pa', campo: 'frenoVoltaggio' },
    ],
  },
  {
    key: 'porte',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoPorte',
        voci: {
          AUTOMATICHE: 'AUTOMATICHE',
          SEMIAUTOMATICHE: 'SEMIAUTOMATICHE',
          MANUALI: 'MANUALI',
        },
      },
      {
        luogo: 'oq',
        voci: {
          porteAutomatiche: 'AUTOMATICHE',
          porteSemiautomatiche: 'SEMIAUTOMATICHE',
          porteManuali: 'MANUALI',
        },
      },
    ],
  },
  {
    // Двоен достъп в картата = 2 достъпа в поръчката.
    key: 'accessi',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', valori: { si: '2', no: '1' } },
      { luogo: 'oq', campo: 'nAccessi' },
    ],
  },
  {
    key: 'pattini',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'pattinoRetrattileNumero' },
      { luogo: 'oq', campo: 'circuitoPattiniN' },
    ],
  },
  {
    // „Laterale“ го има само Montanari — не се сравнява.
    key: 'macchina',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'ubicazioneMacchina', voci: { ALTO: 'ALTO', BASSO: 'BASSO' } },
      { luogo: 'pa', voci: { macchinaAlto: 'ALTO', macchinaBasso: 'BASSO' } },
    ],
  },
  {
    key: 'funiNumero',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiNumero' },
      { luogo: 'pa', campo: 'funiN' },
    ],
  },
  {
    key: 'funiDiametro',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiDiametroMm' },
      { luogo: 'pa', campo: 'funiDiam' },
    ],
  },
];

export function moduloFields(prefix: Prefisso): ModuloField[] {
  const slot = SLOTS.find((s) => s.prefix === prefix);
  if (!slot) throw new Error(`collegati: няма модул с префикс ${prefix}`);
  return fieldsOf(slot.modulo);
}

/** Полетата на модулите, които са в някоя връзка — те не носят свое `prefill` в картата на модула. */
export function campiCollegati(prefix: Prefisso): Set<string> {
  const out = new Set<string>();
  for (const link of COLLEGAMENTI) {
    for (const m of link.membri) {
      if (m.luogo !== prefix) continue;
      if ('campo' in m) out.add(m.campo);
      if ('voci' in m) for (const key of Object.keys(m.voci)) out.add(key);
    }
  }
  return out;
}

/** Проверка при зареждане: всяко място съществува и е от правилния вид — иначе процесът не тръгва. */
function verifica(): void {
  const seen = new Set<string>();
  for (const link of COLLEGAMENTI) {
    for (const m of link.membri) {
      if (m.luogo === 'scheda') {
        const field = fieldByKey(m.campo);
        const ok =
          link.tipo === 'scelta'
            ? field?.kind === 'checks' &&
              'voci' in m &&
              Object.keys(m.voci).every((v) => (field.options as readonly string[]).includes(v))
            : field !== undefined &&
              (['int', 'decimal', 'text'].includes(field.kind) ||
                (field.kind === 'yesno' && 'valori' in m && m.valori !== undefined));
        if (!ok) throw new Error(`collegati ${link.key}: полето ${m.campo} на картата не пасва`);
        continue;
      }
      const fields = new Map(moduloFields(m.luogo).map((f) => [f.key, f]));
      const keys = 'campo' in m ? [m.campo] : Object.keys(m.voci);
      for (const key of keys) {
        const field = fields.get(key);
        const kind = link.tipo === 'scelta' ? 'check' : 'text';
        if (field?.kind !== kind)
          throw new Error(`collegati ${link.key}: ${m.luogo}-${key} не пасва`);
        if (field.prefill)
          throw new Error(`collegati ${link.key}: ${m.luogo}-${key} има и prefill`);
        if (seen.has(`${m.luogo}-${key}`))
          throw new Error(`collegati: ${m.luogo}-${key} е в две връзки`);
        seen.add(`${m.luogo}-${key}`);
      }
    }
  }
}
verifica();

/**
 * Полетата на модулите, които още следват източника си, пътуват със записа под този ключ
 * (public/js/collegati.js): ако формата се върне (грешка, потвърждение), те пак са `data-auto`.
 */
export const AUTO_KEY = 'collegati-auto';

/** Имената във формата (`oq-nFermate`), които могат да бъдат `data-auto` — всичко друго се пренебрегва. */
export const NOMI_COLLEGATI: ReadonlySet<string> = new Set(
  SLOTS.flatMap((slot) => [...campiCollegati(slot.prefix)].map((key) => nameOf(slot.prefix, key))),
);

/** Връзките с поле в тази група на модула — за списъка с разминавания под нея. */
export function collegatiDelGruppo(prefix: Prefisso, campi: readonly string[]): string[] {
  const own = new Set(campi);
  return COLLEGAMENTI.filter((link) =>
    link.membri.some(
      (m) =>
        m.luogo === prefix &&
        ('campo' in m ? own.has(m.campo) : Object.keys(m.voci).some((k) => own.has(k))),
    ),
  ).map((link) => link.key);
}
