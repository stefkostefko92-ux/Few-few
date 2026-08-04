/**
 * Бърза проверка „в кой от тези хиляди префикси попада адресът“.
 *
 * Списъците на доставчиците са големи (само AWS обявява няколко хиляди блока),
 * а `inCidr` разбира текста наново при всяко сравнение. Затова тук префиксите се
 * разбират ВЕДНЪЖ при зареждане и после сравнението е чиста байтова аритметика.
 *
 * Чист модул без мрежа и без зависимости — тестван отделно.
 */

import { parseIp } from "./ip";

export interface CidrEntry<T> {
  cidr: string;
  /** Каквото искаме да знаем за този блок (регион, услуга, град…). */
  value: T;
}

interface Prepared<T> {
  bytes: number[];
  prefix: number;
  entry: CidrEntry<T>;
}

export class CidrSet<T> {
  private readonly v4: Prepared<T>[] = [];
  private readonly v6: Prepared<T>[] = [];

  constructor(entries: Iterable<CidrEntry<T>>) {
    for (const entry of entries) {
      const prepared = prepare(entry);
      if (!prepared) continue;
      (prepared.bytes.length === 4 ? this.v4 : this.v6).push(prepared);
    }
    // Най-тесният блок печели: `52.0.0.0/8` и `52.94.1.0/24` могат да съвпаднат
    // едновременно, но конкретният носи повече информация.
    this.v4.sort((a, b) => b.prefix - a.prefix);
    this.v6.sort((a, b) => b.prefix - a.prefix);
  }

  get size(): number {
    return this.v4.length + this.v6.length;
  }

  /** Най-конкретният блок, който покрива адреса, или `null`. */
  match(bytes: readonly number[]): CidrEntry<T> | null {
    const table = bytes.length === 4 ? this.v4 : this.v6;
    for (const candidate of table) {
      if (covers(candidate, bytes)) return candidate.entry;
    }
    return null;
  }
}

function prepare<T>(entry: CidrEntry<T>): Prepared<T> | null {
  const slash = entry.cidr.lastIndexOf("/");
  if (slash < 0) return null;
  const parsed = parseIp(entry.cidr.slice(0, slash));
  const prefix = Number(entry.cidr.slice(slash + 1));
  if (!parsed) return null;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bytes.length * 8) return null;
  return { bytes: parsed.bytes, prefix, entry };
}

function covers<T>(candidate: Prepared<T>, bytes: readonly number[]): boolean {
  if (candidate.bytes.length !== bytes.length) return false;
  const fullBytes = candidate.prefix >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if ((bytes[i] ?? 0) !== (candidate.bytes[i] ?? 0)) return false;
  }
  const remainingBits = candidate.prefix & 7;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((bytes[fullBytes] ?? 0) & mask) === ((candidate.bytes[fullBytes] ?? 0) & mask);
}

/**
 * Изважда CIDR блоковете от обикновен текстов списък (по един на ред, `#` за
 * коментар). Точно този формат ползват Tor и FireHOL.
 */
export function parseCidrLines(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;
    // Голият адрес в списък означава единичен хост.
    out.push(line.includes("/") ? line : line.includes(":") ? `${line}/128` : `${line}/32`);
  }
  return out;
}
