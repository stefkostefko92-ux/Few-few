// The fields of the survey sheet — THE single source: the form, the checks, the page, the print and the PDF are built
// from here. The order of the sections is that of the printed sheet, numbered by the owner (October 2026): the plate,
// position, kind, panel, argano (or the power unit of a hydraulic lift), ropes and tie rods, governor, cables, locks and
// suspensions, alarm and emergency call, notes — the company may change it (src/lib/rilievi/ordine.ts,
// Company.ordineSezioni); the fields within a section keep this order. The suppliers' modules are in ordini/. The labels
// are in messages/it.json under `rilievi`: `scheda.field.<key>`, `scheda.section.<key>`, `scheda.option.<key>.<VALUE>`,
// `scheda.question.<key>`; the options are in field-options.ts. Ported 1:1 from rilievi (src/schede/fields.ts, commit
// 988f3cf37).
import { QUADRO_MARCA, QUADRO_MODELLO, TIPO_IMPIANTO, TIPO_PORTE, UBICAZIONE_MACCHINA } from './field-options';
import type { Condition, FieldDef, SectionDef, SectionKey } from './field-types';
import { ALTRA, IDRAULICO, NON_IDRAULICO, PORTE_AUTOMATICHE, PORTE_CON_PATTINO, PORTE_SCELTE, yes } from './field-conditions';
import { SEZIONE_ARGANO } from './fields-argano';
import { SEZIONE_CENTRALINA } from './fields-centralina';

export * from './field-types';
export * from './field-options';

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
    // The kind of doors decides what «Serrature o sospensioni» asks. The operator's make, clear opening and voltage —
    // taken off (the owner, October 2026; the columns keep the old answers, the check does not read them), the retiring
    // cam is with the locks.
    key: 'tipologia',
    fields: [
      // One kind of lift and one kind of doors (the owner, October 2026) — a radio, stored as a list.
      { key: 'tipoImpianto', kind: 'checks', options: TIPO_IMPIANTO, single: true },
      { key: 'tipoPorte', kind: 'checks', options: TIPO_PORTE, single: true },
      // «Accessi: 1 / 2» — the double access as a number of accesses.
      { key: 'doppioAccesso', kind: 'yesno', risposte: ['no', 'si'], when: PORTE_SCELTE },
    ],
  },
  {
    // The panel to order: the make (Mastech — and the model); with Pelazza, MoviLift and Mastech their order form
    // (ordini/). The reduced pit and headroom — for the panel; the notes — after the module (October 2026).
    key: 'quadro',
    fields: [
      { key: 'quadroMarca', kind: 'choice', options: QUADRO_MARCA },
      { key: 'quadroMarcaAltro', kind: 'text', maxLength: 120, when: ALTRA('quadroMarca') },
      { key: 'quadroModello', kind: 'choice', options: QUADRO_MODELLO, when: { field: 'quadroMarca', values: ['MASTECH'] } },
      { key: 'fossaRidotta', kind: 'yesno' },
      { key: 'testataRidotta', kind: 'yesno' },
      {
        key: 'quadroOrdine',
        kind: 'yesno',
        wide: true,
        question: true,
        modulo: 'ordineQuadro',
        // the makes with an order form (ordini/registry.ts — the test keeps them the same)
        when: { field: 'quadroMarca', values: ['PELAZZA', 'MOVILIFT', 'MASTECH'] },
      },
      { key: 'quadroNote', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  SEZIONE_ARGANO,
  SEZIONE_CENTRALINA,
  {
    // «Funi e tiranti»: the ropes, then the tie rods — number and kind for the car and for the counterweight; a hydraulic
    // lift has no counterweight — its second tie rods are those fixed in the pit (the owner, October 2026).
    key: 'funi',
    fields: [
      { key: 'funiDiametroMm', kind: 'decimal', min: 0, max: 100, unit: 'mm' },
      { key: 'funiTrefoli', kind: 'int', min: 0, max: 100 },
      { key: 'funiNumero', kind: 'int', min: 0, max: 100 },
      { key: 'funiLunghezzaM', kind: 'decimal', min: 0, max: 10_000, unit: 'm' },
      { key: 'tirantiCabinaNumero', kind: 'int', min: 0, max: 100 },
      { key: 'tirantiCabinaTipo', kind: 'text', maxLength: 120 },
      { key: 'tirantiContrappesoNumero', kind: 'int', min: 0, max: 100, when: NON_IDRAULICO },
      { key: 'tirantiContrappesoTipo', kind: 'text', maxLength: 120, when: NON_IDRAULICO },
      { key: 'tirantiFossaNumero', kind: 'int', min: 0, max: 100, when: IDRAULICO },
      { key: 'tirantiFossaTipo', kind: 'text', maxLength: 120, when: IDRAULICO },
    ],
  },
  {
    key: 'limitatore',
    when: NON_IDRAULICO,
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
    // The doors' locks and suspensions to change — only what goes with the kind of doors of «Tipologia» (the owner,
    // October 2026): the locks and the cam with manual and semi-automatic doors, the suspensions only with automatic
    // ones. The locks — number and kind; the cam — its kind; the suspensions — number and 2SG's sheet, which holds the
    // car operator too (ordini/). The notes — always.
    key: 'serrature',
    fields: [
      { key: 'serrature', kind: 'yesno', when: PORTE_CON_PATTINO },
      { key: 'serratureNumero', kind: 'int', min: 0, max: 999, when: yes('serrature') },
      { key: 'serratureTipo', kind: 'text', maxLength: 120, when: yes('serrature') },
      // «Pattino retrattile da cambiare» (it was in «Tipologia»). The door blocking, the self-levelling and the number of
      // cams — taken off (2026).
      { key: 'pattinoRetrattile', kind: 'yesno', when: PORTE_CON_PATTINO },
      { key: 'pattinoRetrattileTipo', kind: 'text', maxLength: 120, when: yes('pattinoRetrattile') },
      { key: 'sospensioni', kind: 'yesno', wide: true, question: true, modulo: 'ordineSospensioni', when: PORTE_AUTOMATICHE },
      { key: 'sospensioniNumero', kind: 'int', min: 0, max: 999, when: yes('sospensioni') },
      { key: 'serratureNote', kind: 'textarea', maxLength: 4000, wide: true },
    ],
  },
  {
    // «Allarme e telesoccorso» — together, the porter's lodge last (the owner, October 2026). The emergency call — what
    // is to install; it replaces «Telesoccorso esistente» and its state (their columns keep the old answers, the check
    // does not read them).
    key: 'allarme',
    fields: [
      { key: 'telesoccorsoInstallare', kind: 'yesno' },
      { key: 'perifericaInstallare', kind: 'yesno' },
      { key: 'cornettaInstallare', kind: 'yesno' },
      { key: 'allarmePortineria', kind: 'yesno' },
      { key: 'displayPortineria', kind: 'yesno' },
    ],
  },
  {
    key: 'note',
    fields: [
      { key: 'noteQuadretto', kind: 'textarea', maxLength: 4000, wide: true },
      { key: 'noteImpianto', kind: 'textarea', maxLength: 4000, wide: true },
      // «Luce vano da sostituire» — in the notes (the owner moved it from «Tipologia»); with Sì a note by hand (October
      // 2026).
      { key: 'luceVanoSostituire', kind: 'yesno' },
      { key: 'luceVanoNote', kind: 'textarea', maxLength: 4000, wide: true, when: yes('luceVanoSostituire') },
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
  'quadroNote',
  'arganoTipo',
  'kitControlloGanasceTipo',
  'controlloQuadroTipo',
  'arganoNote',
  'centralinaMarca',
  'tuboFlessibileNote',
  'centralinaNote',
  'tirantiCabinaTipo',
  'tirantiContrappesoTipo',
  'tirantiFossaTipo',
  'limitatoreTipo',
  'tenditore',
  'serratureTipo',
  'pattinoRetrattileTipo',
  'serratureNote',
  'noteQuadretto',
  'noteImpianto',
  'luceVanoNote',
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

/** The condition holds with these values; `active` — the fields already shown (the earlier ones). */
function conditionMet(when: Condition, active: ReadonlySet<string>, valueOf: (key: string) => unknown): boolean {
  const has = active.has(when.field) && tokensOf(valueOf(when.field)).some((v) => when.values.includes(v));
  return when.not ? !has : has;
}

/**
 * Which sections and fields make sense with these values: without a condition — always; with one — when it holds and the
 * field it depends on makes sense itself («Tipo di pattino retrattile» ← «Pattino retrattile: Sì» ← «Porte: manuali»); a
 * field of a hidden section makes no sense («Argano» with a hydraulic lift). The controlling field comes earlier in the
 * list (the test keeps it so), hence one pass is enough. The same function decides on the server (what is read and
 * stored) and in the browser (what is shown while typing).
 */
export function activeParts(valueOf: (key: string) => unknown): { sections: Set<SectionKey>; fields: Set<string> } {
  const sections = new Set<SectionKey>();
  const fields = new Set<string>();
  for (const section of SECTIONS as readonly SectionDef[]) {
    if (section.when && !conditionMet(section.when, fields, valueOf)) continue;
    sections.add(section.key);
    for (const field of section.fields) {
      if (!field.when || conditionMet(field.when, fields, valueOf)) fields.add(field.key);
    }
  }
  return { sections, fields };
}

/** The fields that make sense with these values (activeParts). */
export function activeFields(valueOf: (key: string) => unknown): Set<string> {
  return activeParts(valueOf).fields;
}
