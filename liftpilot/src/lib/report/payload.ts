// What a renderer of report/ reads on its stdin: the document as JSON and, for a PDF, the date it carries — its
// record's (a set's issue, a calculation's or a design's saving), never the download's — as meta.created, so that
// every download of a record gives the same bytes (report/stamp.py). The date goes with the document only here: a
// drawing set's hash covers the document, not the moment it is printed. Pure.
import type { DrawingDoc } from '@/drawing';
import type { ReportDoc } from './model';

export const rendererInput = (doc: ReportDoc | DrawingDoc, at?: Date): string =>
  JSON.stringify(at ? { ...doc, meta: { ...doc.meta, created: at.toISOString() } } : doc);
