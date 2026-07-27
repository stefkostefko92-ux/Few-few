// Вложени материали по отчет — редът и складовото движение се раждат заедно.
//
// ДОТУК ВЛОЖЕНОТО БЕШЕ СВОБОДЕН ТЕКСТ. Последицата не е разкрасяване: техникът
// слага контактор, наличността не мърда, следващият вижда „има един" и тръгва
// без резервна част. Отделно вложеното не влизаше в рентабилността, тоест
// всеки договор изглеждаше по-печеливш, отколкото е.
//
// ЗАЩО ДОБАВЯНЕТО, А НЕ ПОДПИСВАНЕТО, СВАЛЯ НАЛИЧНОСТТА. Частта е излязла от
// склада, когато техникът я е взел. А подписването е най-лошият възможен
// момент за отказ „недостатъчна наличност": човекът е пред клиента, с отворен
// капак на шахтата, и няма какво да направи по въпроса. Затова наличността се
// проверява СЕГА, когато корекцията още е възможна.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { rapportinoModificabile } from "@/lib/rapportini-guardie";
import { scriviAudit } from "@/lib/audit";

const schema = z.object({
  articoloId: z.string().uuid(),
  quantita: z.number().int().positive().max(100_000),
});

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const r = await prisma.rapportino.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true },
  });
  if (!r) throw new ErroreHttp(404, "Rapportino non trovato");

  return ok({
    righe: await prisma.materialeRapportino.findMany({
      where: { rapportinoId: id },
      include: {
        articolo: {
          select: { codice: true, nome: true, quantita: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  });
});

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const dati = await corpoValidato(req, schema);

  const riga = await prisma.$transaction(async (tx) => {
    // Проверката за подпис е В транзакцията: отвън между нея и вписването се
    // побираше подписване, тоест материал под вече положен подпис.
    const rapportino = await rapportinoModificabile(id, s, tx);
    // С филтъра по фирма: иначе познат UUID движи наличността на ЧУЖД склад.
    const articolo = await tx.articoloMagazzino.findFirst({
      where: { id: dati.articoloId, ...filtroTenant(s) },
      select: { id: true, quantita: true, nome: true, codice: true },
    });
    if (!articolo) throw new ErroreHttp(404, "Articolo non trovato");

    // СЪЩИЯТ условен UPDATE като в `/api/movimenti`: две едновременни вземания
    // от двама техници не могат да свалят наличността под нула.
    const upd = await tx.articoloMagazzino.updateMany({
      where: { id: dati.articoloId, quantita: { gte: dati.quantita } },
      data: { quantita: { decrement: dati.quantita } },
    });
    if (upd.count === 0)
      throw new ErroreHttp(
        409,
        `Giacenza insufficiente per ${articolo.codice}: disponibili ${articolo.quantita}`,
      );

    const movimento = await tx.movimentoMagazzino.create({
      data: {
        articoloId: dati.articoloId,
        tipo: "USCITA",
        quantita: dati.quantita,
        nota: `Rapportino ${rapportino.numero}`,
        // БЕЗ тази връзка вложеното не стига до отчета за рентабилност и
        // договорът изглежда печеливш само защото материалът липсва в сметката.
        ordineLavoroId: rapportino.ordineLavoroId,
        ...tenantDiCreazione(s),
      },
    });

    return tx.materialeRapportino.create({
      data: {
        rapportinoId: id,
        articoloId: dati.articoloId,
        quantita: dati.quantita,
        movimentoId: movimento.id,
        ...tenantDiCreazione(s),
      },
      include: { articolo: { select: { codice: true, nome: true } } },
    });
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "materiali_rapportino",
    entitaId: riga.id,
    dettagli: {
      valori: {
        articolo: { a: riga.articolo.codice },
        quantita: { a: String(dati.quantita) },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok(riga, 201);
});
