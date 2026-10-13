import { fieldByKey } from '../schede/fields.js';
import { fieldsOf, type ModuloField } from './moduli.js';
import { SLOTS, type Prefisso } from './registry.js';
import { nameOf } from './valori.js';

/**
 * Свързаните данни — СПИСЪКЪТ: едно и също нещо от уредбата, записано на повече от едно място — в
 * картата, в поръчката за таблото (Pelazza `oq` или MoviLift `om` — според марката, никога двете) и в
 * запитването за аргано (Montanari, `pa`). Правилата върху него (попълване, разминавания) са в
 * collegati.ts; същият списък стига до браузъра като JSON и public/js/collegati.js прави същото,
 * докато се пише.
 */

export type Luogo = 'scheda' | Prefisso;

/** Число или текст с числа („1,0“, „400 V“). `valori` превежда отговор от картата („si“ → „2“). */
export type MembroNumero =
  | { luogo: 'scheda'; campo: string; valori?: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo: string };

/**
 * Избор: коя стойност коя категория е. В картата — отметките на поле (`checks`) или „Sì/No“ (`yesno`);
 * в модула — отметките му (ключовете им) или опциите на радио група (`campo`, ключовете са `valore`).
 */
export type MembroScelta =
  | { luogo: 'scheda'; campo: string; voci: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo?: string; voci: Readonly<Record<string, string>> };

export type Collegamento =
  | { key: string; tipo: 'numero'; membri: readonly MembroNumero[] }
  | { key: string; tipo: 'scelta'; membri: readonly MembroScelta[] };

/**
 * Редът на местата е и редът на попълването: първо картата, после таблото, после аргано. Решено със
 * собственика (октомври 2026): спирките, скоростта и нейният вид, ходът, товарът, нормата, напрежението
 * на мотора и на спирачката — плюс досегашното попълване от картата (врати, достъпи, шейни, място на
 * машината, въжета). MoviLift пише и капацитета, № на асансьора и входовете на кабината.
 */
export const COLLEGAMENTI: readonly Collegamento[] = [
  {
    key: 'fermate',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'fermate' },
      { luogo: 'oq', campo: 'nFermate' },
      { luogo: 'om', campo: 'fermate' },
      { luogo: 'pa', campo: 'fermate' },
    ],
  },
  {
    key: 'velocita',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'velocita' },
      { luogo: 'om', campo: 'velocita' },
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
      { luogo: 'om', campo: 'corsa' },
      { luogo: 'pa', campo: 'corsa' },
    ],
  },
  {
    key: 'portata',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'portataKg' },
      { luogo: 'om', campo: 'portata' },
      { luogo: 'pa', campo: 'portata' },
    ],
  },
  {
    key: 'capienza',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'capienzaPersone' },
      { luogo: 'om', campo: 'capienza' },
    ],
  },
  {
    key: 'numeroImpianto',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'numeroImpianto' },
      { luogo: 'om', campo: 'nImpianto' },
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
    // MoviLift: „Tens.“ в данните на аргано („Fune“). Тяхното „Freno“ не казва дали е напрежение.
    key: 'tensioneMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motVca' },
      { luogo: 'om', campo: 'tensFune' },
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
    // Същото за MoviLift: радио „Operatore Unico / Doppio Ingresso (Selezionato)“.
    key: 'ingressi',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', voci: { no: 'UNICO', si: 'DOPPIO' } },
      {
        luogo: 'om',
        campo: 'ingressi',
        voci: { unico: 'UNICO', doppio: 'DOPPIO', doppioSelezionato: 'DOPPIO' },
      },
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
      { luogo: 'om', campo: 'locMacc', voci: { alto: 'ALTO', basso: 'BASSO' } },
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

/** Полетата на модула, които едно място заема: полето му, иначе отметките му. */
export function campiDi(m: MembroNumero | MembroScelta): string[] {
  if ('campo' in m && m.campo !== undefined) return [m.campo];
  return 'voci' in m ? Object.keys(m.voci) : [];
}

/** Полетата на модулите, които са в някоя връзка — те не носят свое `prefill` в картата на модула. */
export function campiCollegati(prefix: Prefisso): Set<string> {
  const out = new Set<string>();
  for (const link of COLLEGAMENTI) {
    for (const m of link.membri) if (m.luogo === prefix) for (const key of campiDi(m)) out.add(key);
  }
  return out;
}

const NUMERO_SCHEDA: readonly string[] = ['int', 'decimal', 'text', 'digits'];

/** Проверка при зареждане: всяко място съществува и е от правилния вид — иначе процесът не тръгва. */
function verifica(): void {
  const seen = new Set<string>();
  for (const link of COLLEGAMENTI) {
    for (const m of link.membri) {
      if (m.luogo === 'scheda') {
        const field = fieldByKey(m.campo);
        const opzioni: readonly string[] =
          field?.kind === 'checks' ? field.options : field?.kind === 'yesno' ? ['si', 'no'] : [];
        const ok =
          link.tipo === 'scelta'
            ? 'voci' in m &&
              opzioni.length > 0 &&
              Object.keys(m.voci).every((v) => opzioni.includes(v))
            : field !== undefined &&
              (NUMERO_SCHEDA.includes(field.kind) ||
                (field.kind === 'yesno' && 'valori' in m && m.valori !== undefined));
        if (!ok) throw new Error(`collegati ${link.key}: полето ${m.campo} на картата не пасва`);
        continue;
      }
      const fields = new Map(moduloFields(m.luogo).map((f) => [f.key, f]));
      for (const key of campiDi(m)) {
        const field = fields.get(key);
        // Число — текстов ред; избор — отметки, или радио група, сред чиито опции са всички `voci`.
        const radio = 'voci' in m && m.campo !== undefined ? m.voci : null;
        const ok =
          link.tipo === 'numero'
            ? field?.kind === 'text'
            : radio
              ? field?.kind === 'radio' &&
                Object.keys(radio).every((v) => field.opzioni.some((o) => o.valore === v))
              : field?.kind === 'check';
        if (!field || !ok) throw new Error(`collegati ${link.key}: ${m.luogo}-${key} не пасва`);
        if ('prefill' in field && field.prefill)
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
    link.membri.some((m) => m.luogo === prefix && campiDi(m).some((key) => own.has(key))),
  ).map((link) => link.key);
}
