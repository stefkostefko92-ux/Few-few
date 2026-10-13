import { fieldByKey } from '../schede/fields.js';
import { COLLEGAMENTI } from './collegamenti-elenco.js';
import { fieldsOf, type ModuloField } from './moduli.js';
import { SLOTS, type Prefisso } from './registry.js';
import { nameOf } from './valori.js';

export { COLLEGAMENTI };

/**
 * Свързаните данни: видовете места, полетата им във формата и проверката при старт. Списъкът е в
 * collegamenti-elenco.ts; правилата върху него (попълване, разминавания) — в collegati.ts; същият
 * списък стига до браузъра като JSON и public/js/collegati.js прави същото, докато се пише.
 */

export type Luogo = 'scheda' | Prefisso;

/**
 * Стойност — число или текст („1,0“, „400 V“, „Via Roma 1“). В картата — поле с текст, цифри или число
 * (`valori` превежда отговор „Sì/No“ на картата: „si“ → „2“); в модула — ред, падащ списък или два реда
 * за едно нещо (`campi`: „LUCE PORTA: [800] x [2000]“).
 */
export type MembroNumero =
  | { luogo: 'scheda'; campo: string; valori?: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo: string }
  | { luogo: Prefisso; campi: readonly [string, string] };

/**
 * Избор: коя стойност коя категория е. В картата — отметките на поле (`checks`) или „Sì/No“ (`yesno`);
 * в модула — отметките му (ключовете им) или опциите на радио група (`campo`, ключовете са `valore`).
 */
export type MembroScelta =
  | { luogo: 'scheda'; campo: string; voci: Readonly<Record<string, string>> }
  | { luogo: Prefisso; campo?: string; voci: Readonly<Record<string, string>> };

/**
 * Връзка: стойност (`numero`) или избор (`scelta`). `confronto: false` — само попълване, без списък с
 * разминавания: местата ѝ законно пишат едно и също различно („Selcom“ и „Selcom Midi Supra“).
 */
export type Collegamento =
  | { key: string; tipo: 'numero'; confronto?: false; membri: readonly MembroNumero[] }
  | { key: string; tipo: 'scelta'; membri: readonly MembroScelta[] };

/** Сравнява ли се връзката (списъкът с разминавания, потвърждението при запис). */
export const confrontato = (link: Collegamento): boolean =>
  link.tipo === 'scelta' || link.confronto !== false;

export function moduloFields(prefix: Prefisso): ModuloField[] {
  const slot = SLOTS.find((s) => s.prefix === prefix);
  if (!slot) throw new Error(`collegati: няма модул с префикс ${prefix}`);
  return fieldsOf(slot.modulo);
}

/** Полетата на модула, които едно място заема: полето му, двата му реда, иначе отметките му. */
export function campiDi(m: MembroNumero | MembroScelta): string[] {
  if ('campi' in m) return [...m.campi];
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
const NUMERO_MODULO: readonly string[] = ['text', 'select'];

/** Проверка при зареждане: всяко място съществува и е от правилния вид — иначе процесът не тръгва. */
function verifica(): void {
  const seen = new Set<string>();
  for (const link of COLLEGAMENTI) {
    const luoghi = new Set<Luogo>();
    for (const m of link.membri) {
      // Едно място за карта или модул във връзка: попълването и списъкът го търсят по мястото.
      if (luoghi.has(m.luogo)) throw new Error(`collegati ${link.key}: ${m.luogo} е два пъти`);
      luoghi.add(m.luogo);
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
        // Стойност — ред или падащ списък (двата реда — само редове); избор — отметки, или радио
        // група, сред чиито опции са всички `voci`.
        const radio = 'voci' in m && m.campo !== undefined ? m.voci : null;
        const ok =
          link.tipo === 'numero'
            ? field !== undefined &&
              ('campi' in m ? field.kind === 'text' : NUMERO_MODULO.includes(field.kind))
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
 * Полетата, които още следват източника си, пътуват със записа под този ключ (public/js/collegati.js):
 * ако формата се върне (грешка, потвърждение), те пак са `data-auto`.
 */
export const AUTO_KEY = 'collegati-auto';

/**
 * Имената във формата, които могат да бъдат `data-auto` — всичко друго се пренебрегва: свързаните
 * полета на картата и на модулите и полетата на модулите с предварителна стойност от огледа (`prefill`).
 */
export const NOMI_SEGUACI: ReadonlySet<string> = new Set([
  ...COLLEGAMENTI.flatMap((link) =>
    link.membri.flatMap((m) => (m.luogo === 'scheda' ? [m.campo] : [])),
  ),
  ...SLOTS.flatMap((slot) => [
    ...[...campiCollegati(slot.prefix)].map((key) => nameOf(slot.prefix, key)),
    ...fieldsOf(slot.modulo)
      .filter((field) => 'prefill' in field && field.prefill)
      .map((field) => nameOf(slot.prefix, field.key)),
  ]),
]);

/** Сравняваните връзки с поле в тази група на модула — за списъка с разминавания под нея. */
export function collegatiDelGruppo(prefix: Prefisso, campi: readonly string[]): string[] {
  const own = new Set(campi);
  return COLLEGAMENTI.filter(
    (link) =>
      confrontato(link) &&
      link.membri.some((m) => m.luogo === prefix && campiDi(m).some((key) => own.has(key))),
  ).map((link) => link.key);
}
