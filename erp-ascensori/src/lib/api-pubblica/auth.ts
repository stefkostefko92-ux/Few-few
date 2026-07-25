// Автентикация на публичното API.
//
// Отделно от сесиите на хората: външната система няма бисквитка, няма втори
// фактор и не бива да ползва потребителски акаунт — уволненият служител иначе
// сваля счетоводната интеграция със себе си.

import { prisma } from "@/lib/prisma";
import { ErroreHttp } from "@/lib/auth";
import { chiaveDaHeader, hashChiave, autorizza, type Ambito } from "@/lib/api-pubblica/chiavi";

export interface ContestoApi {
  chiaveId: string;
  tenantId: string | null;
  ambiti: string[];
}

/**
 * Проверява ключа и правото. Хвърля 401/403 — никога не връща „почти валиден".
 *
 * Съобщенията НЕ различават „непознат ключ" от „отменен ключ": това е същата
 * дисциплина като при входа, където отговорът е еднакъв, за да не се изброяват
 * съществуващи акаунти.
 */
export async function richiedeChiave(req: Request, ambito: Ambito): Promise<ContestoApi> {
  const chiave = chiaveDaHeader(req.headers.get("authorization"));
  if (!chiave) throw new ErroreHttp(401, "Chiave API mancante o non valida");

  const riga = await prisma.apiKey.findUnique({
    where: { chiaveHash: hashChiave(chiave) },
    select: { id: true, tenantId: true, ambiti: true, scadenza: true, revocataAt: true },
  });
  if (!riga) throw new ErroreHttp(401, "Chiave API mancante o non valida");

  const esito = autorizza(riga, ambito);
  if (!esito.valida) {
    // Липсващото ПРАВО е 403: ключът е истински, просто не може това. Отменен и
    // изтекъл остават 401 — те не са въпрос на права.
    if (esito.motivo === "ambito")
      throw new ErroreHttp(403, `Ambito «${ambito}» non concesso a questa chiave`);
    throw new ErroreHttp(401, "Chiave API mancante o non valida");
  }

  // Кога е ползван за последно — за да може да се изчисти мъртъв ключ. Пишем без
  // да чакаме: това е телеметрия, не бива да бави отговора или да го проваля.
  void prisma.apiKey
    .update({ where: { id: riga.id }, data: { ultimoUso: new Date() } })
    .catch(() => {});

  return { chiaveId: riga.id, tenantId: riga.tenantId, ambiti: riga.ambiti };
}

/** Филтърът по фирма за ключ. Ключът НИКОГА не е на ниво доставчик. */
export function filtroChiave(c: ContestoApi): { tenantId: string | null } {
  return { tenantId: c.tenantId ?? null };
}
