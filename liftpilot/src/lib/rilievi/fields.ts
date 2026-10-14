// The fields of the survey sheet — THE single source: the form, the checks, the page, the print and the PDF are built
// from here. The order of the sections is that of the printed sheet, numbered by the owner (October 2026): the plate,
// position, kind, panel, argano, ropes, governor, cables, locks and suspensions, alarm, notes — the company may change it
// (src/lib/rilievi/ordine.ts, Company.ordineSezioni); the fields within a section keep this order. The suppliers' modules
// are in ordini/. The labels are in messages/it.json under `rilievi`: `scheda.field.<key>`, `scheda.section.<key>`,
// `scheda.option.<key>.<VALUE>`, `scheda.question.<key>`. Ported 1:1 from rilievi (src/schede/fields.ts, commit ae6329cb6).
import type { Condition, FieldDef, SectionDef } from './field-types';

export * from './field-types';

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
// GEARLESS is shown as «MRL» (the messages): the value in the database stays, so that the previous code reads it.
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;
export const TELESOCCORSO_STATO = ['COMPLETO', 'MANCA_PERIFERICA'] as const;
export const QUADRO_MARCA = ['PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO'] as const;

const yes = (field: string): Condition => ({ field, values: ['si'] });
/** The door operator makes sense with automatic and semi-automatic doors. */
const PORTE_CON_OPERATORE: Condition = { field: 'tipoPorte', values: ['AUTOMATICHE', 'SEMIAUTOMATICHE'] };
/** The double access — with every kind of doors, the manual ones too (the owner's decision, October 2026). */
const PORTE_SCELTE: Condition = { field: 'tipoPorte', values: TIPO_PORTE };
/** The retiring cam — with manual and with semi-automatic doors. */
const PORTE_CON_PATTINO: Condition = { field: 'tipoPorte', values: ['MANUALI', 'SEMIAUTOMATICHE'] };
/** "Altro" as the make → which one. */
const ALTRA = (field: string): Condition => ({ field, values: ['ALTRO'] });

export const SECTIONS = [
  {
    // Section 1 is laid out like the head and the plate of the sheet (the owner, October 2026): the date; the address and
    // the work order; the matricola and the lift's number; the load, the capacity, the stops and the make.
    key: 'impianto',
    fields: [
      { key: 'data', kind: 'date' },
      { key: 'indirizzo', kind: 'text', maxLength: 200, wide: true },
      // The work order the survey was made for — may stay empty.
      { key: 'buonoLavoro', kind: 'text', maxLength: 60 },
      { key: 'matricola', kind: 'digits', maxLength: 20 },
      { key: 'numeroImpianto', kind: 'digits', maxLength: 20 },
      { key: 'portataKg', kind: 'int', min: 0, max: 100_000, unit: 'kg' },
      { key: 'capienzaPersone', kind: 'int', min: 0, max: 1_000, unit: 'persone' },
      { key: 'fermate', kind: 'int', min: 0, max: 300 },
      { key: 'marca', kind: 'text', maxLength: 120 },
    ],
  },
  {
    key: 'ubicazione',
    fields: [
      { key: 'ubicazioneMacchina', kind: 'checks', options: UBICAZIONE_MACCHINA },
      // Where the box is — free text ("Piano -1, vano contatori").
      { key: 'ubicazioneCassettina', kind: 'text', maxLength: 120 },
      { key: 'parcheggio', kind: 'text', maxLength: 300, wide: true },
    ],
  },
  {
    key: 'tipologia',
    fields: [
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE },
      { key: 'operatoreMarca', kind: 'text', maxLength: 120, when: PORTE_CON_OPERATORE },
      // The clear opening and the voltage — free text ("800 x 2000", "24 V DC").
      { key: 'lucePorte', kind: 'text', maxLength: 60, when: PORTE_CON_OPERATORE },
      { key: 'operatoreTensione', kind: 'text', maxLength: 60, when: PORTE_CON_OPERATORE },
      // «Accessi: 1 / 2» — the double access as a number of accesses.
      { key: 'doppioAccesso', kind: 'yesno', risposte: ['no', 'si'], when: PORTE_SCELTE },
      // «Pattino retrattile da cambiare». The door blocking, the self-levelling and the number of cams — taken off (2026).
      { key: 'pattinoRetrattile', kind: 'yesno', when: PORTE_CON_PATTINO },
    ],
  },
  {
    // The control panel to order: the make; with Pelazza and MoviLift their order form (ordini/).
    key: 'quadro',
    fields: [
      { key: 'quadroMarca', kind: 'choice', options: QUADRO_MARCA },
      { key: 'quadroMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('quadroMarca') },
      {
        key: 'quadroOrdine',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineQuadro',
        // the makes with an order form (ordini/registry.ts — the test keeps them the same)
        when: { field: 'quadroMarca', values: ['PELAZZA', 'MOVILIFT'] },
      },
    ],
  },
  {
    // «Argano da sostituire?» — with Sì the machine's data sheet, for every kind of machine (ordini/).
    key: 'argano',
    fields: [{ key: 'arganoPreventivo', kind: 'yesno', wide: true, question: true, modulo: 'preventivoArgano' }],
  },
  {
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    key: 'limitatore',
    fields: [
      { key: 'limitatoreTipo', kind: 'text', maxLength: 120 },
      { key: 'funicellaDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funicellaLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tenditore', kind: 'text', maxLength: 120 },
    ],
  },
  {
    key: 'cavi',
    fields: [
      { key: 'caviNumero', kind: 'int', min: 0, max: 100 },
      { key: 'caviConduttori', kind: 'int', min: 0, max: 1_000 },
      { key: 'caviLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
    ],
  },
  {
    // The doors' locks and suspensions to change: the locks — number and kind; the suspensions — number and 2SG's sheet,
    // which holds the car operator too (ordini/).
    key: 'serrature',
    fields: [
      { key: 'serrature', kind: 'yesno' },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, when: yes('serrature') },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, when: yes('serrature') },
      { key: 'sospensioni', kind: 'yesno', wide: true, question: true, modulo: 'ordineSospensioni' },
      { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
    ],
  },
  {
    key: 'allarme',
    fields: [
      { key: 'telesoccorso', kind: 'yesno' },
      { key: 'telesoccorsoStato', kind: 'choice', options: TELESOCCORSO_STATO, when: yes('telesoccorso') },
      { key: 'allarmePortineria', kind: 'yesno' },
      { key: 'displayPortineria', kind: 'yesno' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      // «Luce vano da sostituire» — in the notes (the owner moved it from «Tipologia»).
      { key: 'luceVanoSostituire', kind: 'yesno' },
      { key: 'noteBottoniere', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'bottoniereMisure', kind: 'yesno', wide: true, question: true, misure: true },
      { key: 'lavoriExtra', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
] as const satisfies readonly SectionDef[];

export type SchedaFieldKey = (typeof SECTIONS)[number]['fields'][number]['key'];

/** Every field in the order of the brief. */
export const FIELDS: readonly FieldDef[] = SECTIONS.flatMap((section): readonly FieldDef[] => section.fields);

/** At least one of these must be filled in — otherwise the sheet can never be found again. */
export const IDENTIFIERS = ['indirizzo', 'matricola', 'numeroImpianto'] as const;

/** The form's key of the error "at least one of address / matricola / number". */
export const IDENTIFIERS_ERROR_KEY = 'identifiers';

/** The text fields the search bar searches (the identifying numbers first). */
export const SEARCHABLE = [
  'numeroImpianto',
  'matricola',
  'indirizzo',
  'marca',
  'buonoLavoro',
  'parcheggio',
  'operatoreMarca',
  'serratureTipo',
  'limitatoreTipo',
  'tenditore',
  'noteQuadretto',
  'noteImpianto',
  'noteBottoniere',
  'lavoriExtra',
] as const satisfies readonly SchedaFieldKey[];

export function fieldByKey(key: string): FieldDef | undefined {
  return FIELDS.find((field) => field.key === key);
}

/** The value as the form's words: Sì/No → 'si'/'no', the ticks — their list, a choice — itself. */
export function tokensOf(raw: unknown): string[] {
  if (raw === true) return ['si'];
  if (raw === false) return ['no'];
  if (typeof raw === 'string') return raw === '' ? [] : [raw];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string');
  return [];
}

/**
 * Which fields make sense with these values: without a condition — always; with one — when it holds and the field it
 * depends on makes sense itself ("Numero serrature" ← "Serrature da cambiare: Sì"). The controlling
 * field comes earlier in the list (the test keeps it so), hence one pass is enough. The same function decides on the
 * server (what is read and stored) and in the browser (what is shown while typing).
 */
export function activeFields(valueOf: (key: string) => unknown): Set<string> {
  const active = new Set<string>();
  for (const field of FIELDS) {
    const when = field.when;
    const met = !when || (active.has(when.field) && tokensOf(valueOf(when.field)).some((v) => when.values.includes(v)));
    if (met) active.add(field.key);
  }
  return active;
}
