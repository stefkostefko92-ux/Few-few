import 'server-only';
import type { DrawingDoc } from '@/drawing';
import { canonHash } from './canon-hash';

/** SHA-256 of the canonical drawing set: every sheet, word and colour; a set is drawn again only when it matches. */
export const tavoleHash = (doc: DrawingDoc): string => canonHash(doc);
