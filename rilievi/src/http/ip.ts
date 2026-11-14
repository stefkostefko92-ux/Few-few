import { isIP } from 'node:net';

/** Адресът на клиента: IPv4, записан като IPv6 (`::ffff:1.2.3.4`), става IPv4; невалиден — null. */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  const value = mapped ? mapped[1]! : trimmed;
  return isIP(value) ? value : null;
}

/**
 * Мрежата на адреса — ключът за таваните на заявки и за броене на неуспешни опити. IPv4 (и IPv4,
 * записан като IPv6) остава както е. IPv6 става своята /64: един абонат обикновено държи цялата /64 и
 * би заобиколил таван по адрес просто като сменя последните 64 бита.
 */
export function ipNetwork(raw: string | null | undefined): string | null {
  const ip = normalizeIp(raw);
  if (!ip) return null;
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
