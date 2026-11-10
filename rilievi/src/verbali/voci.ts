import { textParser } from '../schede/field-parsers.js';

/**
 * Редовете на „Verbale di chiusura cantiere“ — разделите и редовете на хартиения лист на собственика (5
 * ноември 2026): „Locale macchina“, „Vano corsa“, „Cabina“, „Finiture“, всеки с „Varie“ накрая. Всеки ред
 * е текст (какво е направено, в какво състояние е); редовете с „Certificato“ имат и SÌ/NO вдясно, другите
 * — нищо (собственикът: „Нищо — само текст“). Ключовете са формата на записа и на отпечатъка: смяна на
 * ключ обезсилва печатите на потвърдените протоколи. Надписите са в речника (`verbali.voce.<ключ>`).
 */

export interface VoceVerbale {
  key: string;
  /** „Certificato“ SÌ/NO вдясно. */
  certificato?: boolean;
  /** „Varie“ — няколко реда текст. */
  varie?: boolean;
}

export interface SezioneVerbale {
  key: 'locale' | 'vano' | 'cabina' | 'finiture';
  voci: readonly VoceVerbale[];
}

export const SEZIONI_VERBALE: readonly SezioneVerbale[] = [
  {
    key: 'locale',
    voci: [
      { key: 'quadro', certificato: true },
      { key: 'argano', certificato: true },
      { key: 'funi', certificato: true },
      { key: 'impiantoElettrico' },
      { key: 'limitatore', certificato: true },
      { key: 'varieLocale', varie: true },
    ],
  },
  {
    key: 'vano',
    voci: [
      { key: 'lineeElettriche' },
      { key: 'cavi' },
      { key: 'serrature', certificato: true },
      { key: 'luceVano' },
      { key: 'varieVano', varie: true },
    ],
  },
  {
    key: 'cabina',
    voci: [
      { key: 'circuitoCabina' },
      { key: 'bottoniera' },
      { key: 'tettoCabina' },
      { key: 'varieCabina', varie: true },
    ],
  },
  {
    key: 'finiture',
    voci: [{ key: 'bottoniere' }, { key: 'imbotti' }, { key: 'varieFiniture', varie: true }],
  },
];

export const VOCI_VERBALE: readonly VoceVerbale[] = SEZIONI_VERBALE.flatMap((s) => s.voci);

/** Таваните на текста: редът — кратко описание; „Varie“ — няколко реда. */
export const MAX_RIGA = 300;
export const MAX_VARIE = 1000;
export const maxDi = (voce: VoceVerbale): number => (voce.varie ? MAX_VARIE : MAX_RIGA);

export type Certificato = 'si' | 'no';
export const CERTIFICATI: readonly Certificato[] = ['si', 'no'];

/** Записаното за един ред: текстът и (само при „Certificato“) SÌ/NO. Празното не се пази. */
export interface ValoreVoce {
  t?: string;
  c?: Certificato;
}
export type ValoriVerbale = Record<string, ValoreVoce>;

export type ErroreVoce = 'invalid' | 'tooLong';

/** Текстът на реда — същото чистене като на картата: редът в един ред, „Varie“ пази новите редове. */
const PARSER = {
  riga: textParser({ kind: 'text', maxLength: MAX_RIGA }),
  varie: textParser({ kind: 'textarea', maxLength: MAX_VARIE }),
};
const parserDi = (voce: VoceVerbale) => (voce.varie ? PARSER.varie : PARSER.riga);

/**
 * Редовете от пратеното от формата: `t-<ключ>` — текстът, `c-<ключ>` — „si“/„no“ (само при „Certificato“).
 * Непознати ключове не се четат; грешка — твърде дълъг текст, нещо различно от низ, друга стойност на
 * „Certificato“ или „Certificato“ на ред без него.
 */
export function vociDalForm(
  raw: Record<string, unknown>,
): { ok: true; voci: ValoriVerbale } | { ok: false; errors: Record<string, ErroreVoce> } {
  const voci: ValoriVerbale = {};
  const errors: Record<string, ErroreVoce> = {};
  for (const voce of VOCI_VERBALE) {
    const testo = raw[`t-${voce.key}`];
    const scelta = raw[`c-${voce.key}`];
    const value: ValoreVoce = {};
    const t = parserDi(voce).safeParse(testo);
    if (!t.success)
      errors[`t-${voce.key}`] = t.error.issues[0]?.message === 'tooLong' ? 'tooLong' : 'invalid';
    else if (t.data !== null) value.t = t.data;
    if (scelta !== undefined && scelta !== '') {
      if (!voce.certificato || !CERTIFICATI.includes(scelta as Certificato))
        errors[`c-${voce.key}`] = 'invalid';
      else value.c = scelta as Certificato;
    }
    if (value.t !== undefined || value.c !== undefined) voci[voce.key] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, voci };
}

/**
 * Записаното в базата, прочетено с недоверие: само познатите ключове, само низове в таваните, „Certificato“
 * само където го има. Каквото не минава — не се показва, не се подписва и не влиза в PDF-а.
 */
export function valoriVerbale(json: unknown): ValoriVerbale {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const raw = json as Record<string, unknown>;
  const out: ValoriVerbale = {};
  for (const voce of VOCI_VERBALE) {
    const value = raw[voce.key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const { t, c } = value as Record<string, unknown>;
    const entry: ValoreVoce = {};
    if (typeof t === 'string' && t !== '' && t.length <= maxDi(voce)) entry.t = t;
    if (voce.certificato && (c === 'si' || c === 'no')) entry.c = c;
    if (entry.t !== undefined || entry.c !== undefined) out[voce.key] = entry;
  }
  return out;
}
