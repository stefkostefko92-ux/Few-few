// Кой може да управлява кой акаунт — една проверка за всяко действие.
//
// Преди всяко действие над чужд акаунт (промяна, парола, отключване, втори
// фактор, сесии) повтаряше своя вариант на същата проверка. Тук е една:
//   • в обхвата на администратора (MASTER — всички фирми, ADMIN — своята);
//   • MASTER се пипа САМО от MASTER;
//   • с `privilegiato`: акаунт със ЗАДЪЛЖИТЕЛЕН втори фактор (ADMIN/MASTER) —
//     само от MASTER. Иначе един ADMIN би свалил втория фактор на друг ADMIN.

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroreHttp, type Sessione } from "@/lib/auth";
import { filtroUtenti } from "@/lib/tenant";
import { mfaObbligatorio } from "@/lib/password-policy";

export async function utenteGestibile(
  s: Sessione,
  id: string,
  opz: { privilegiato?: boolean } = {},
): Promise<User> {
  const u = await prisma.user.findFirst({ where: { id, ...filtroUtenti(s) } });
  if (!u) throw new ErroreHttp(404, "Utente non trovato");
  if (u.ruolo === "MASTER" && s.ruolo !== "MASTER")
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può gestire utenti MASTER",
    );
  if (opz.privilegiato && mfaObbligatorio(u.ruolo) && s.ruolo !== "MASTER")
    throw new ErroreHttp(
      403,
      "Solo il livello MASTER può intervenire sulla sicurezza di un amministratore",
    );
  return u;
}

/**
 * Администраторът, с когото се свързва акаунт CLIENTE.
 *
 * Връзката решава какво вижда клиентът — затова администраторът трябва да е
 * от СЪЩАТА фирма като акаунта (иначе клиент на едната фирма вижда данните на
 * другата). За всяко друго ниво връзката се нулира: тя няма смисъл там, а
 * останала след смяна на нивото, би се „съживила" при връщане към CLIENTE.
 *
 * `undefined` = без промяна; `null` = без връзка.
 */
export async function amministratoreCliente(
  richiesto: string | null | undefined,
  ruolo: string,
  tenantId: string | null,
): Promise<string | null | undefined> {
  if (ruolo !== "CLIENTE") return null;
  if (!richiesto) return richiesto;
  const a = await prisma.amministratore.findFirst({
    where: { id: richiesto, tenantId },
    select: { id: true },
  });
  if (!a) throw new ErroreHttp(422, "Amministratore non trovato");
  return a.id;
}
