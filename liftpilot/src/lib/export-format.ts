// The company's data export (src/server/company-export.ts) as the public register of its format describes it
// (/<locale>/data; Data Act art. 26(b)): its name, its version and its top-level keys in order. The export is typed on
// these keys, so a key added or removed there fails the typecheck until the register says so — and then the version
// goes up.
export const EXPORT_FORMAT = 'liftpilot-company-export';
export const EXPORT_FORMAT_VERSION = 12;

/** The top-level keys: the envelope, then the data (each one described on the page, messages: dataPage.keys.<key>).
 *  The uploaded files come last: the route writes them one at a time after the rest (src/server/company-export.ts). */
export const EXPORT_ENVELOPE = ['format', 'formatVersion', 'exportedAt', 'termsVersion', 'note'] as const;
export const EXPORT_DATA = ['company', 'users', 'invites', 'rolePermissions', 'logos', 'projects', 'priceItems', 'customPrices', 'schede', 'feedback',
  'auditLog', 'attachments'] as const;

export type ExportKey = (typeof EXPORT_ENVELOPE)[number] | (typeof EXPORT_DATA)[number];

/** What a project carries inside the export (messages: dataPage.project.<key>). */
export const EXPORT_PROJECT = ['calculations', 'shaftDesigns', 'liftDesigns', 'roomDesigns', 'drawingSets', 'technicalReports', 'formDrafts', 'clientLogos'] as const;

/** Every version of the format, oldest first (messages: dataPage.history.v<version>): the day it began, null for the
 *  first. The last is EXPORT_FORMAT_VERSION. */
export const EXPORT_FORMAT_HISTORY = [
  { version: 1, since: null },
  { version: 2, since: '2026-10-06' },
  { version: 3, since: '2026-10-12' },
  { version: 4, since: '2026-10-14' },
  // the users no longer carry the account's language: the product speaks Italian only (migration 19_locale_it)
  { version: 5, since: '2026-10-14' },
  // the sheets as rilievi ae6329cb6 keeps them, the company's order of their sections (migration 18_rilievi_sync)
  { version: 6, since: '2026-10-14' },
  // each sheet names the installation it is linked to (migration 20_rilievi_impianti, round 44)
  { version: 7, since: '2026-10-14' },
  // each calculation names the intervention declared with it, each lift design the calculation it was drawn on
  // (migration 21_intervento, round 45)
  { version: 8, since: '2026-10-14' },
  // the installations no longer carry their module (Project.kind, read by no code since round 45: the type of
  // intervention is each calculation's; dropped in round 47 by migration 22_drop_project_kind —
  // the format does not change)
  { version: 9, since: '2026-10-15' },
  // the reports the company's users sent with «Segnala un problema» (migration 24_feedback, round 48)
  { version: 10, since: '2026-10-16' },
  // the sheets as rilievi 988f3cf37 keeps them: the power unit, Mastech's model, the tie rods, the notes, the emergency
  // call to install, the print choices (migration 26_rilievi_sync_2, round 49)
  { version: 11, since: '2026-10-21' },
  // the relazione tecnica di modifica (migration 27_relazione_modifica, round 49): each installation's registry
  // (anagrafica), its issued reports with their revisions and their files as listed at issue, and the uploaded files
  // with their bytes in base64 (attachments, written last, one at a time)
  { version: 12, since: '2026-10-21' },
] as const;

/** The day the register last changed (the page shows it). */
export const EXPORT_REGISTER_DATE = '2026-10-21';
