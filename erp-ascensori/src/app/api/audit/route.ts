// Регистър на операциите — САМО четене, само ADMIN+ (MASTER вижда всичко).
// Никакъв маршрут за промяна/изтриване не съществува — по документация.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { paginazione, testoParam } from "@/lib/query";

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const url = new URL(req.url);
  const entita = testoParam(url, "entita");
  const azione = testoParam(url, "azione");
  const { page, size, skip, take } = paginazione(url);
  // Обхват по фирма. Без него ADMIN на една фирма четеше кой какво е правил в
  // друга — заедно с имената и служебните имейли в `include`.
  // MASTER е нивото на доставчика и вижда всичко (както при потребителите).
  const where = {
    ...(entita ? { entita } : {}),
    ...(azione ? { azione } : {}),
    ...(s.ruolo === "MASTER" ? {} : filtroTenant(s)),
  };
  const [righe, totale] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      // Изричен подбор, а не `include`: `seq` е BigInt и `JSON.stringify` го
      // отказва — а вътрешният номер на веригата така или иначе не е за навън.
      select: {
        id: true,
        azione: true,
        entita: true,
        entitaId: true,
        dettagli: true,
        ip: true,
        userAgent: true,
        utenteId: true,
        tenantId: true,
        createdAt: true,
        hmac: true,
        hmacPrecedente: true,
        versioneFirma: true,
        utente: { select: { nome: true, cognome: true, email: true } },
      },
      orderBy: { seq: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});
