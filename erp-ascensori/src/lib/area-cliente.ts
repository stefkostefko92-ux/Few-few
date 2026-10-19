// „Area cliente" — какво вижда акаунт на ниво CLIENTE и само то.
//
// Клиентът е администраторът на кондоминиуми (или негов служител). Вижда
// САМО своето: кондоминиумите, които управлява, импиантите в тях (или
// записани на него), сроковете, отворените интервенции и ИЗДАДЕНИТЕ фактури.
// Без цени на разходите, без имена на служители, без вътрешни бележки.
//
// Обхватът е ЕДНО място: всяко четене минава през `filtro…` оттук, винаги
// заедно с `filtroTenant`. Вторият филтър не е излишен — администраторът е
// на фирмата, а не глобален.

import { prisma } from "@/lib/prisma";
import { ErroreHttp, richiedeRuolo, type Sessione } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";

/** Сесия на клиент + администраторът му; `null`, ако акаунтът не е свързан. */
export async function sessioneCliente(): Promise<{
  s: Sessione;
  amministratoreId: string | null;
}> {
  const s = await richiedeRuolo("CLIENTE");
  // Вътрешните нива имат своите страници; тази е само за клиента — иначе
  // служител без връзка би видял празна „Area cliente" вместо гестионала.
  if (s.ruolo !== "CLIENTE")
    throw new ErroreHttp(403, "Area riservata ai clienti");
  const u = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { amministratoreId: true },
  });
  return { s, amministratoreId: u?.amministratoreId ?? null };
}

export function filtroImpiantiCliente(s: Sessione, amministratoreId: string) {
  return {
    ...filtroTenant(s),
    OR: [{ amministratoreId }, { condominio: { amministratoreId } }],
  };
}

/** Само издадени фактури: черновата не е документ за клиента. */
export function filtroFattureCliente(s: Sessione, amministratoreId: string) {
  return {
    ...filtroTenant(s),
    tipo: "EMESSA" as const,
    stato: { not: "BOZZA" as const },
    OR: [{ amministratoreId }, { condominio: { amministratoreId } }],
  };
}
