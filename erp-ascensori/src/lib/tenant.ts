// Изолация на данните между фирми (мулти-инсталация).
//
// Документацията е недвусмислена: „Gli utenti **e i dati** sono separati per
// azienda". Досега `tenantId` стоеше само на `User` и се ползваше единствено
// за лицензния гейт — тоест данните НЕ бяха разделени и потребител на фирма А
// четеше импианти, служители и фактури на фирма Б.
//
// Правилото тук е ЗАТВОРЕНО ПО ПОДРАЗБИРАНЕ: филтърът се прилага на всяка
// заявка, а записите се раждат с tenantId-то на автора.

import type { Sessione } from "@/lib/auth";

/**
 * Условие за филтриране по фирма.
 *
 * При еднофирмена инсталация (`tenantId === null`) връщаме филтър за `null`,
 * а не празен обект — иначе, ако някой ден в базата се появят редове с
 * попълнен tenant, еднофирменият потребител би започнал да ги вижда.
 */
export function filtroTenant(s: Sessione): { tenantId: string | null } {
  return { tenantId: s.tenantId ?? null };
}

/** Стойността, с която се раждат новите записи. */
export function tenantDiCreazione(s: Sessione): { tenantId: string | null } {
  return { tenantId: s.tenantId ?? null };
}

/**
 * Обхват за АДМИНИСТРИРАНЕТО НА ПОТРЕБИТЕЛИ.
 *
 * MASTER е ниво на доставчика: няма своя фирма и трябва да може да обслужва
 * всички инсталации — затова вижда всичко. Всеки друг, включително ADMIN, е
 * ограничен до своята фирма; иначе администраторът на фирма А чете имейлите и
 * сменя паролите на фирма Б.
 */
export function filtroUtenti(s: Sessione): { tenantId?: string | null } {
  return s.ruolo === "MASTER" ? {} : filtroTenant(s);
}

/**
 * Слива филтъра по фирма в подаденото `where`, без да позволява
 * презаписване от клиентски параметър.
 */
export function conTenant<T extends Record<string, unknown>>(
  where: T,
  s: Sessione
): T & { tenantId: string | null } {
  return { ...where, ...filtroTenant(s) };
}
