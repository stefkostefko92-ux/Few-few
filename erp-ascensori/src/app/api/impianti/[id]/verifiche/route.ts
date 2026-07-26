// Законовите проверки на уредбата — чл. 13 и 14 D.P.R. 162/1999.
//
// Вписването НЕ е просто запис: от изхода зависи дали уредбата може да работи.
// Затова тук се случват три неща наведнъж и в ЕДНА транзакция — записът,
// следващият срок и (при отрицателен изход) административното спиране. Ако се
// разделят, съществува състояние, в което проверката е вписана като
// отрицателна, а уредбата още е „ATTIVO“.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { verificaImpiantoSchema } from "@/lib/entities";
import { prossimaVerifica, statoDopoVerifica } from "@/lib/normativa/verifiche";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const i = await prisma.impianto.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true },
  });
  if (!i) throw new ErroreHttp(404, "Impianto non trovato");
  const righe = await prisma.verificaImpianto.findMany({
    where: { impiantoId: id },
    orderBy: { data: "desc" },
    include: {
      documento: { select: { id: true, titolo: true, fileUrl: true } },
    },
  });
  return ok({ righe });
});

export const POST = gestito(async (req, ctx) => {
  // Вписването мени правния статус на уредбата — не е работа на техника.
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, verificaImpiantoSchema);

  const esito = await prisma.$transaction(async (tx) => {
    const i = await tx.impianto.findFirst({
      where: { id, ...filtroTenant(s) },
      select: { id: true, matricola: true, stato: true },
    });
    if (!i) throw new ErroreHttp(404, "Impianto non trovato");

    // Срокът се извежда от правилото, но подаденият изрично има предимство:
    // органът може да определи по-кратък срок от законовия.
    const prossima =
      data.prossimaVerifica ??
      prossimaVerifica(data.data, data.esito, data.tipo ?? "PERIODICA");

    const verifica = await tx.verificaImpianto.create({
      data: {
        impiantoId: id,
        tipo: data.tipo ?? "PERIODICA",
        data: data.data,
        esito: data.esito,
        organismo: data.organismo ?? undefined,
        numeroVerbale: data.numeroVerbale ?? undefined,
        prescrizioni: data.prescrizioni ?? undefined,
        scadenzaPrescrizioni: data.scadenzaPrescrizioni ?? undefined,
        prossimaVerifica: prossima ?? undefined,
        documentoId: data.documentoId ?? undefined,
        note: data.note ?? undefined,
        utenteId: s.sub,
        ...tenantDiCreazione(s),
      },
    });

    // Изведената от служба уредба не се пипа: тя вече не е в служба, а
    // презаписването би скрило истинската ѝ съдба.
    const nuovoStato =
      i.stato === "DISMESSO" ? null : statoDopoVerifica(data.esito, i.stato);
    await tx.impianto.update({
      where: { id },
      data: {
        // Само при ПЕРИОДИЧНА: извънредната не смъква двугодишния часовник.
        ...((data.tipo ?? "PERIODICA") === "PERIODICA"
          ? { ultimaRevisione: data.data, prossimaRevisione: prossima ?? null }
          : {}),
        ...(nuovoStato ? { stato: nuovoStato } : {}),
      },
    });

    // Срокът в списъка със законовите дати върви заедно с уредбата: иначе
    // напомнянето продължава да сочи старата дата.
    if (prossima && (data.tipo ?? "PERIODICA") === "PERIODICA") {
      const esistente = await tx.scadenzaImpianto.findFirst({
        where: { impiantoId: id, tipo: "revisione" },
        orderBy: { dataScadenza: "desc" },
      });
      if (esistente)
        await tx.scadenzaImpianto.update({
          where: { id: esistente.id },
          data: {
            dataScadenza: prossima,
            // Праговете се вдигат наново за НОВИЯ срок; иначе известията за
            // изтеклия остават вдигнати и следващите 90/60/30 дни минават мълчешком.
            notificato90: false,
            notificato60: false,
            notificato30: false,
          },
        });
      else
        await tx.scadenzaImpianto.create({
          data: {
            impiantoId: id,
            tipo: "revisione",
            dataScadenza: prossima,
            ...tenantDiCreazione(s),
          },
        });
    }

    return { verifica, nuovoStato, matricola: i.matricola };
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "verifiche_impianti",
    entitaId: esito.verifica.id,
    dettagli: dettagliCreazione({
      ...data,
      impiantoId: id,
      statoImpianto: esito.nuovoStato,
    }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(esito.verifica, 201);
});
