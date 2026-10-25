import { randomUUID } from 'node:crypto';
import { hmacHex } from './crypto.js';

/**
 * Подписаният плик на моста (§5) и на агента (§9): `{"p":"<json низ>","sig":"<hex>"}`, където
 * `sig = HMAC-SHA256(ключ, UTF-8 байтовете на p)`. Подписва се самият низ, точно както се праща —
 * без канонизация, затова C# и Node не могат да се разминат. Векторът (общ с xunit тестовете):
 * HMAC на `{"a":"б"}` с ключ `k` = cbe3d618023a5e002fabbf60787c7c3eace0fed4d426c56cca26641d6ab481d7.
 */
export interface CommandPayload {
  id: string;
  ts: number;
  actor: string;
  action: string;
  args: Record<string, string | number>;
}

export interface Envelope {
  p: string;
  sig: string;
}

export function signPayload(key: string, payload: string): string {
  return hmacHex(key, payload);
}

export function envelope(key: string, payload: CommandPayload): string {
  const p = JSON.stringify(payload);
  const message: Envelope = { p, sig: signPayload(key, p) };
  return JSON.stringify(message);
}

export function newPayload(
  action: string,
  args: Record<string, string | number>,
  actor: string,
  now: number,
): CommandPayload {
  return { id: randomUUID(), ts: now, actor, action, args };
}
