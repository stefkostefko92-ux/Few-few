import { createHash } from 'node:crypto';

/**
 * Примерната верига за „Опитайте да подправите издаден документ“ на началната страница: три звена с
 * измислени номера, дати и суми. Отпечатъците са истински SHA-256 върху опростен запис — същият низ
 * смята и браузърът (`public/js/site-trial.js`), затова началното състояние винаги „съвпада“.
 * Истинската верига (`src/ledger/chain.ts`) хешира пълния запис и го заверява с HMAC печат.
 */
export const DEMO_CHAIN_PREFIX = 'fakturist-demo';

const ROWS = [
  { no: '0000000123', date: '2026-11-09', cents: 80000 },
  { no: '0000000124', date: '2026-11-12', cents: 120000 },
  { no: '0000000125', date: '2026-11-12', cents: 45000 },
] as const;

export interface DemoLink {
  no: string;
  date: string;
  cents: number;
  prev: string;
  hash: string;
}

export function demoChain(): DemoLink[] {
  let prev = '0'.repeat(64);
  return ROWS.map((row) => {
    const hash = createHash('sha256')
      .update([DEMO_CHAIN_PREFIX, row.no, row.date, String(row.cents), prev].join('\n'), 'utf8')
      .digest('hex');
    const link = { ...row, prev, hash };
    prev = hash;
    return link;
  });
}
