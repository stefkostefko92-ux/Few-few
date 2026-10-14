import 'server-only';
import { createHash } from 'node:crypto';
import { canon } from '@/calc/snapshot';

/** SHA-256 of the canonical JSON of a record (keys sorted, non-finite numbers as text): every hash of a record. */
export const canonHash = (x: unknown): string => createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
