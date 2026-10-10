import type { LookupAddress, LookupOptions } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * SSRF защита за всеки изходящ адрес към helpdesk (§15.1): само https, без потребител/парола в
 * адреса, а името се разрешава и ВСЕКИ получен адрес се проверява срещу частни, loopback,
 * link-local, metadata (169.254.169.254, fd00:ec2::254), CGNAT, multicast и запазени мрежи. Връзката
 * се прави към ПРОВЕРЕНИЯ адрес (собствен `lookup` в заявката) — DNS rebinding между проверката
 * и връзката няма как да подмени целта. Пренасочвания не се следват (http.ts).
 */

export interface NetPolicy {
  /**
   * САМО за тестовете (локален фалшив сървър): позволява http:// и частни адреси. Задава се от код,
   * никога от средата — в продукция е винаги false.
   */
  allowInsecureLocal: boolean;
  timeoutMs: number;
  /** Таван на тялото на отговора (байтове) — по-голямо → `response_too_large`. */
  maxResponseBytes: number;
  /** DNS — подменя се в unit тестовете. */
  resolve?: (host: string) => Promise<LookupAddress[]>;
}

export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

const BLOCKED = new BlockList();
// IPv4: „тази“ мрежа, частни (RFC 1918), CGNAT, loopback, link-local (+ облачни metadata),
// IETF/TEST-NET/документация, 6to4 relay, benchmark, multicast, запазени и broadcast.
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
// IPv6: неопределен, loopback, NAT64/6to4/Teredo (носят IPv4 вътре — изцяло забранени), discard,
// IETF/документация, ULA (вкл. fd00:ec2::254), link-local, site-local, multicast. IPv4-mapped
// (::ffff:a.b.c.d) BlockList сам проверява по IPv4 правилата — затова ::ffff:0:0/96 НЕ е тук (би
// забранил всеки IPv4 адрес).
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/** Забранен ли е адресът (невалиден = забранен). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) return BLOCKED.check(address, 'ipv6');
  return true;
}

export type UrlProblem = 'invalid_url' | 'https_required' | 'credentials_in_url' | 'ssrf_blocked';

/** Имена, които никога не са публични (loopback/вътрешни зони). */
const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/** Проверка на адреса БЕЗ мрежа: схема, потребител/парола, IP литерал, вътрешно име. */
export function checkUrl(
  raw: string,
  policy: Pick<NetPolicy, 'allowInsecureLocal'>,
): { ok: true; url: URL } | { ok: false; code: UrlProblem } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: 'invalid_url' };
  }
  const insecureOk = policy.allowInsecureLocal && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !insecureOk) return { ok: false, code: 'https_required' };
  if (url.username || url.password) return { ok: false, code: 'credentials_in_url' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, code: 'invalid_url' };
  if (policy.allowInsecureLocal) return { ok: true, url };
  if (isIP(host) !== 0 ? isBlockedAddress(host) : LOCAL_NAME.test(host)) {
    return { ok: false, code: 'ssrf_blocked' };
  }
  return { ok: true, url };
}

/** Грешка на мрежовия слой — само код (влиза в дневника на доставките). */
export class NetFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NetFailure';
  }
}

async function systemResolve(host: string): Promise<LookupAddress[]> {
  return dnsLookup(host, { all: true, verbatim: true });
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` за заявката: разрешава името и отказва, ако КОЙТО И ДА Е адрес е забранен (смесени
 * записи са белег за rebinding). Връща проверените адреси — сокетът се свързва само към тях.
 */
export function guardedLookup(policy: NetPolicy) {
  const resolve = policy.resolve ?? systemResolve;
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    resolve(hostname).then(
      (found) => {
        const wanted = options.family === 4 || options.family === 6 ? options.family : 0;
        const addrs = found.filter((a) => wanted === 0 || a.family === wanted);
        if (addrs.length === 0) return callback(new NetFailure('dns_failed'), '');
        if (!policy.allowInsecureLocal && found.some((a) => isBlockedAddress(a.address))) {
          return callback(new NetFailure('ssrf_blocked'), '');
        }
        const first = addrs[0] as LookupAddress;
        if (options.all) callback(null, addrs);
        else callback(null, first.address, first.family);
      },
      () => callback(new NetFailure('dns_failed'), ''),
    );
  };
}
