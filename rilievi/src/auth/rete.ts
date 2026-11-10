import { prisma } from '../db.js';
import { ipNetwork } from '../http/ip.js';
import { DAY, MINUTE } from '../time.js';
import { hmacRete } from './chiavi.js';

/**
 * Таванът на грешните входове по мрежа (IPv4 адрес или IPv6 /64) — в базата, затова важи след рестарт и
 * за всички процеси (таванът на заявки в паметта, http/limits.ts, — не). Срещу налучкване на много
 * акаунти от едно място (credential stuffing), което заключването по акаунт не хваща. Пази се само HMAC
 * на мрежата (не адресът), един ден. Успешен вход не нулира брояча — иначе атакуващият би вмъквал
 * свой верен вход между опитите.
 */
export const RETE_FINESTRA_MS = 15 * MINUTE;
export const RETE_MAX_ERRORI = 30;
const RETE_CONSERVAZIONE_MS = DAY;

function chiave(ip: string | null | undefined): string | null {
  const rete = ipNetwork(ip);
  return rete ? hmacRete(rete) : null;
}

/** Мрежата е надхвърлила тавана в последните 15 минути — входът от нея спира, преди да се провери. */
export async function reteBloccata(
  ip: string | null | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  const rete = chiave(ip);
  if (!rete) return false;
  const errori = await prisma.loginFailure.count({
    where: { rete, createdAt: { gte: new Date(now - RETE_FINESTRA_MS) } },
  });
  return errori >= RETE_MAX_ERRORI;
}

/** Грешна парола, непознат имейл или грешен код от тази мрежа. */
export async function registraErrore(ip: string | null | undefined): Promise<void> {
  const rete = chiave(ip);
  if (rete) await prisma.loginFailure.create({ data: { rete } });
}

/** Поддръжката: по-старото от ден се трие. */
export async function pulisciErrori(now: number = Date.now()): Promise<number> {
  const result = await prisma.loginFailure.deleteMany({
    where: { createdAt: { lt: new Date(now - RETE_CONSERVAZIONE_MS) } },
  });
  return result.count;
}
