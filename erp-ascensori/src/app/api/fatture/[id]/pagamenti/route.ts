// Получени плащания по фактура.
//
// Отделен маршрут, а не поле „платена" върху документа: плащането има дата,
// сума, начин и следа към банката, а частичните плащания са правило при
// кондоминиумите. Статусът на фактурата се ИЗВЕЖДА от постъпленията — не се
// задава на ръка.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { pagamentoSchema } from "@/lib/entities";
import { ricalcolaPagamenti } from "@/lib/totali-db";
import { emettiEvento } from "@/lib/webhook/emetti";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  const righe = await prisma.pagamento.findMany({
    where: { fatturaId: id },
    orderBy: { data: "asc" },
  });
  return ok({ righe });
});

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, pagamentoSchema);

  const { pagamento, fattura } = await prisma.$transaction(async (tx) => {
    // Филтърът по фирма е ЗАДЪЛЖИТЕЛЕН: без него познат UUID записва
    // постъпление по чужда фактура.
    const f = await tx.fattura.findFirst({
      where: { id, ...filtroTenant(s) },
      select: { id: true, stato: true, numero: true },
    });
    if (!f) throw new ErroreHttp(404, "Fattura non trovata");
    // По чернова не се плаща: документът още не е издаден.
    if (f.stato === "BOZZA")
      throw new ErroreHttp(
        409,
        "La fattura è ancora in bozza: emetterla prima di registrare incassi",
      );

    const pagamento = await tx.pagamento.create({
      data: {
        fatturaId: id,
        data: data.data ?? new Date(),
        importo: data.importo,
        modalita: data.modalita ?? "MP05",
        riferimento: data.riferimento ?? undefined,
        note: data.note ?? undefined,
        utenteId: s.sub,
        ...tenantDiCreazione(s),
      },
    });
    await ricalcolaPagamenti(id, tx);
    const fattura = await tx.fattura.findUniqueOrThrow({
      where: { id },
      select: {
        numero: true,
        statoPagamento: true,
        totalePagato: true,
        totaleLordo: true,
      },
    });
    // Външното счетоводство се интересува от пълното плащане; частичните са
    // наша кухня, докато не се съберат.
    if (fattura.statoPagamento === "PAGATA")
      await emettiEvento(
        "fattura.pagata",
        {
          id,
          numero: fattura.numero,
          totalePagato: String(fattura.totalePagato),
          totaleLordo: String(fattura.totaleLordo),
        },
        s.tenantId ?? null,
        tx,
      );
    return { pagamento, fattura };
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "pagamenti",
    entitaId: pagamento.id,
    dettagli: dettagliCreazione({ ...data, fatturaId: id }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ pagamento, statoPagamento: fattura.statoPagamento }, 201);
});
