// The limits of the uploaded files (round 49, plan §6.1 and §13): one place for every number the upload, the quota, the
// download and the relazione tecnica di modifica (RT) use. The database's CHECKs (migration 27) bound the same columns
// and these never exceed them: 20 MiB per file, 200 pages, 160-character titles, 120-character names. The PDF tool's own
// limits (src/lib/report/pdf-tool.ts PDF_TOOL_LIMITS, FASCICOLO_LIMITS) are the same numbers, pinned by the upload
// test. Pure: the pages show them too (the quota bar).

/** One file: at most 20 MiB as stored (= CHECK size BETWEEN 1 AND 20971520); the error text says «20 MB». */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** The request around the file: the multipart envelope, the title, the kind and the component never need 64 KiB. */
export const BODY_OVERHEAD_BYTES = 64 * 1024;

/** What the upload route reads at most before it stops (the byte counter); nginx lets 21 MiB through on that path. */
export const MAX_BODY_BYTES = MAX_FILE_BYTES + BODY_OVERHEAD_BYTES;

export const ALLEGATI_LIMITS = {
  /** pages of a PDF (= CHECK pages BETWEEN 1 AND 200; the PDF tool refuses more) */
  maxPages: 200,
  /** a PDF ends with «%%EOF» within its last KiB (some writers add a line or a few bytes after it) */
  pdfTailBytes: 1024,
  /** a picture: at most 40 megapixels and 12 000 px a side, read from its header before anything decodes it */
  maxPixels: 40_000_000,
  maxSidePx: 12_000,
  /** files per installation, and bytes per company (the error text says «60 file» and «500 MB») */
  perProject: 60,
  perCompanyBytes: 500 * 1024 * 1024,
  /** uploads per user and hour; downloads per user and 10 minutes; edits and deletions per user and 10 minutes */
  uploadsPerHour: 60,
  downloadsPer10Min: 60,
  editsPer10Min: 120,
  /** uploads read at the same time by one application process (each holds up to MAX_BODY_BYTES in memory) */
  uploadsInFlight: 4,
  /** texts (= CHECK char_length(title) BETWEEN 1 AND 160, char_length("fileName") BETWEEN 1 AND 120) */
  titleMax: 160,
  fileNameMax: 120,
} as const;

/** What one RT may append (plan §13): 40 files, 400 pages, 120 MiB (S7 checks it at the issue); and the pixels of the
 *  PNGs the fascicolo decodes again (with transparency or interlaced: src/lib/allegati/png.ts) at most 300 megapixels —
 *  about 25 s of the assembly's 60 (measured: 950 megapixels in 76 s on 4 cores) — so an issued RT is always assembled. */
export const RT_ALLEGATI_LIMITS = { maxFiles: 40, maxPages: 400, maxBytes: 120 * 1024 * 1024, maxSlowPixels: 300_000_000 } as const;

/** The file types the product takes, by their bytes only. */
export type AllegatoType = 'pdf' | 'jpeg' | 'png';
export type AllegatoMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export const MIME_OF: Readonly<Record<AllegatoType, AllegatoMime>> = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' };
export const TYPE_OF: Readonly<Record<AllegatoMime, AllegatoType>> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpeg', 'image/png': 'png' };
export const EXT_OF: Readonly<Record<AllegatoType, string>> = { pdf: 'pdf', jpeg: 'jpg', png: 'png' };
export const isAllegatoMime = (m: string): m is AllegatoMime => Object.prototype.hasOwnProperty.call(TYPE_OF, m);
