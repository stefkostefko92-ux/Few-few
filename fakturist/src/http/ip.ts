import { isIPv6 } from 'node:net';
import type { Request } from 'express';

/**
 * Ключът за тавана на заявките: IPv4 — целият адрес; IPv6 — мрежата /64. Един абонат обикновено има цяла
 * /64 и иначе всеки адрес от нея би имал свой брояч (заобикаляне на тавана).
 */
export function rateKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const plain = ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
  if (!isIPv6(plain)) return plain;
  const [head = '', tail = ''] = plain.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const full = [...headParts, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailParts];
  return `${full
    .slice(0, 4)
    .map((part) => part.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export function requestRateKey(req: Request): string {
  return rateKey(req.ip);
}
