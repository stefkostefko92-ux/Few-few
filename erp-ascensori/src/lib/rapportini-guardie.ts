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
import type { ClientePrisma } from "@/lib/totali-db";

export interface RapportinoModificabile {
  id: string;
  numero: string;
  firmatoAt: Date | null;
  ordineLavoroId: string | null;
}

/**
 * Отчетът съществува, наш е и НЕ е подписан.
 *
 * УСЛОВЕН ЗАПИС, НЕ ЧЕТЕНЕ, И ВЪТРЕ В ТРАНЗАКЦИЯТА НА ПРОМЯНАТА. Четенето
 * отвън беше TOCTOU: между „не е подписан" и вписването на материала другата
 * заявка успяваше да подпише, и редът влизаше ПОД подписа — тоест клиентът е
 * подписал един списък, а системата пази друг, при това с движение по склада.
 * `updateMany` с условие `firmatoAt: null` или сработва под ключалката на
 * реда, или връща 0; конкурентното подписване чака нашата транзакция.
 */
export async function rapportinoModificabile(
  id: string,
  s: Sessione,
  tx: ClientePrisma = prisma,
): Promise<RapportinoModificabile> {
  const esito = await tx.rapportino.updateMany({
    where: { id, ...filtroTenant(s), firmatoAt: null },
    data: { updatedAt: new Date() },
  });
  const r = await tx.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true, numero: true, firmatoAt: true, ordineLavoroId: true },
  });
  if (!r) throw new ErroreHttp(404, "Rapportino non trovato");
  // Подписаният отчет е заключен. Иначе подписът не доказва нищо: съдържанието
  // под него може да се смени после — включително вложеното, което клиентът
  // плаща.
  if (esito.count !== 1)
    throw new ErroreHttp(
      409,
      "Rapportino già firmato: i materiali non sono più modificabili.",
    );
  return r;
}
