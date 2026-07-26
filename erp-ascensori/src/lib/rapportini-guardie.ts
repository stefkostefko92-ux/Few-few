// Кога рапортино-то още може да се пипа.
//
// ЗАЩО СОБСТВЕН МОДУЛ, А НЕ ФУНКЦИЯ В МАРШРУТА. Правилото важи за ДВА
// маршрута — добавянето на материал и махането му — а файл в App Router не
// бива да изнася нищо освен HTTP обработчиците. Досега вторият маршрут носеше
// копие на същите редове, при коментар в първия, който твърдеше, че са общи.
// Правило, дублирано веднъж, се разминава на първата промяна: „заключвай и при
// затворен ордин" би влязло в едното копие и складът щеше да остане отворен.

import { prisma } from "@/lib/prisma";
import { ErroreHttp, type Sessione } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";

export interface RapportinoModificabile {
  id: string;
  numero: string;
  firmatoAt: Date | null;
  ordineLavoroId: string | null;
}

/** Отчетът съществува, наш е и НЕ е подписан. */
export async function rapportinoModificabile(
  id: string,
  s: Sessione,
): Promise<RapportinoModificabile> {
  const r = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true, numero: true, firmatoAt: true, ordineLavoroId: true },
  });
  if (!r) throw new ErroreHttp(404, "Rapportino non trovato");
  // Подписаният отчет е заключен. Иначе подписът не доказва нищо: съдържанието
  // под него може да се смени после — включително вложеното, което клиентът
  // плаща.
  if (r.firmatoAt)
    throw new ErroreHttp(
      409,
      "Rapportino già firmato: i materiali non sono più modificabili.",
    );
  return r;
}
