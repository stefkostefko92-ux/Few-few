// The company's data export (src/server/company-export.ts) as the public register of its format describes it
// (/<locale>/data; Data Act art. 26(b)): its name, its version and its top-level keys in order. The export is typed on
// these keys, so a key added or removed there fails the typecheck until the register says so — and then the version
// goes up.
export const EXPORT_FORMAT = 'liftpilot-company-export';
export const EXPORT_FORMAT_VERSION = 2;

/** The top-level keys: the envelope, then the data (each one described on the page, messages: dataPage.keys.<key>). */
export const EXPORT_ENVELOPE = ['format', 'formatVersion', 'exportedAt', 'termsVersion', 'note'] as const;
export const EXPORT_DATA = ['company', 'users', 'invites', 'logos', 'projects', 'priceItems', 'customPrices', 'auditLog'] as const;

export type ExportKey = (typeof EXPORT_ENVELOPE)[number] | (typeof EXPORT_DATA)[number];

/** What a project carries inside the export (messages: dataPage.project.<key>). */
export const EXPORT_PROJECT = ['calculations', 'shaftDesigns', 'liftDesigns', 'roomDesigns', 'drawingSets', 'formDrafts', 'clientLogos'] as const;

/** The day the register last changed (the page shows it). */
export const EXPORT_REGISTER_DATE = '2026-10-06';
