import 'server-only';
// The relazione tecnica di modifica on the server: its record's hash (the canonical snapshot, src/lib/rt/snapshot.ts) and
// the hash of the document built from it (docSha, inside the snapshot: the builder's wording is part of the record).
import { canonHash } from './canon-hash';

/** SHA-256 of the canonical record of an RT. */
export const rtHash = (snapshot: unknown): string => canonHash(snapshot);

/** SHA-256 of the document of an RT: its blocks and its meta, before rendering. */
export const rtDocSha = (doc: { blocks: unknown; meta: unknown }): string => canonHash({ blocks: doc.blocks, meta: doc.meta });
