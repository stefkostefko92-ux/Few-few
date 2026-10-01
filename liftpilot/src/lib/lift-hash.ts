import 'server-only';
import { createHash } from 'node:crypto';
import { canon, type Json } from '@/calc/snapshot';

/** SHA-256 of a lift design: the derivation's version, the form as entered and the hashes of the two records made. */
export const liftHash = (x: { engine: string; inputs: Json; shaft: string; calc: string }): string =>
  createHash('sha256').update(JSON.stringify(canon(x))).digest('hex');
