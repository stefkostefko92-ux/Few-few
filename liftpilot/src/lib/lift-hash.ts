import 'server-only';
import type { Json } from '@/calc/snapshot';
import { canonHash } from './canon-hash';

/** SHA-256 of a lift design: the derivation's version, the form as entered and the hashes of the two records made. */
export const liftHash = (x: { engine: string; inputs: Json; shaft: string; calc: string }): string => canonHash(x);
