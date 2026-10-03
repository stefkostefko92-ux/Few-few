import { isIP } from 'node:net';

/**
 * Мрежата на адреса — ключът за таваните на заявки и за броене на неуспешни опити. IPv4 (и IPv4,
 * записан като IPv6) остава както е. IPv6 става своята /64: един абонат обикновено държи цялата /64 и
 * би заобиколил таван по адрес просто като сменя последните 64 бита.
 */
export function ipNetwork(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped?.[1] && isIP(mapped[1]) === 4) return mapped[1];
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return null;
  const [head = '', tail = ''] = ip.toLowerCase().split('%')[0]!.split('::');
  const groups = (part: string) =>
    part ? part.split(':').flatMap((g) => (g.includes('.') ? ['0', '0'] : [g])) : [];
  const h = groups(head);
  const t = groups(tail);
  const all = ip.includes('::')
    ? [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t]
    : h;
  return `${all
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':')}::/64`;
}
