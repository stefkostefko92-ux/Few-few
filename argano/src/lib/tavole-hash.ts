import 'server-only';
import { createHash } from 'node:crypto';
import { canon, type Json } from '@/calc/snapshot';
import type { DrawingDoc } from '@/drawing';

/** SHA-256 of the canonical drawing set: every sheet, word and colour; a set is drawn again only when it matches. */
export const tavoleHash = (doc: DrawingDoc): string => createHash('sha256').update(JSON.stringify(canon(doc as unknown as Json))).digest('hex');
