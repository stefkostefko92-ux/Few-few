// Фирмата, в която MASTER работи в момента — подписът на бисквитката.
//
// MASTER е ниво на доставчика и няма своя фирма; за да влезе в данните на
// клиент (поддръжка, миграция, проверка), избира фирма и сървърът му дава
// бисквитка `ea_azienda`. Стойността е `<tenantId>.<подпис>`, а подписът
// покрива И потребителя, И сесията: бисквитка, пусната отвън (cookie tossing
// от поддомейн), или пренесена в друга сесия, не се приема. Чисто — без база и
// без `next/headers`, за да носи тест.

import { createHmac, timingSafeEqual } from "node:crypto";

export const CONTESTO_COOKIE = "ea_azienda";

const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firma(
  segreto: string,
  sub: string,
  sid: string,
  tenantId: string,
): string {
  return createHmac("sha256", segreto)
    .update(`azienda|v1|${sub}|${sid}|${tenantId}`)
    .digest("base64url");
}

export function valoreContesto(
  segreto: string,
  sub: string,
  sid: string,
  tenantId: string,
): string {
  return `${tenantId}.${firma(segreto, sub, sid, tenantId)}`;
}

/** Фирмата от бисквитката или `null` — при всяко съмнение `null`. */
export function leggiValoreContesto(
  segreto: string,
  sub: string,
  sid: string | undefined,
  valore: string | undefined,
): string | null {
  if (!valore || !sid) return null;
  const punto = valore.indexOf(".");
  if (punto < 0) return null;
  const tenantId = valore.slice(0, punto);
  if (!RE_UUID.test(tenantId)) return null;
  const atteso = Buffer.from(firma(segreto, sub, sid, tenantId));
  const dato = Buffer.from(valore.slice(punto + 1));
  if (dato.length !== atteso.length || !timingSafeEqual(dato, atteso))
    return null;
  return tenantId;
}
