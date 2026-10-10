// What the database keeps of an e-mail link's token: its SHA-256 (server side; src/lib/tokens.ts).
import { createHash } from 'node:crypto';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
