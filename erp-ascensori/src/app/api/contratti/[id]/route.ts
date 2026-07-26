// Contratto по id: четене, промяна, изтриване.
//
// Промяната е стеснена по състояние: активният договор вече е родил ордини и
// фактури, и смяната на canone или периодичността под тях прави издадените
// документи необясними при проверка.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica, dettagliCancellazione } from "@/lib/audit-dettagli";
import { contrattoBase, conPeriodoValido } from "@/lib/entities";
import {
  contrattoModificabile,
  contrattoEliminabile,
} from "@/lib/regole-contratti";

const include = {
  amministratore: true,
  condominio: true,
  impianti: {
    include: {
      impianto: {
        select: { id: true, matricola: true, marca: true, indirizzo: true },
      },
    },
  },
  ordini: {
    select: {
      id: true,
      numero: true,
      stato: true,
      dataInizio: true,
      oggetto: true,
    },
    orderBy: { dataInizio: "desc" as const },
    take: 20,
  },
  fatture: {
    select: {
      id: true,
      numero: true,
      stato: true,
      data: true,
      totaleLordo: true,
    },
    orderBy: { data: "desc" as const },
    take: 20,
  },
};

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const r = await prisma.contratto.findFirst({
    where: { id, ...filtroTenant(s) },
    include,
  });
  if (!r) throw new ErroreHttp(404, "Contratto non trovato");
  return ok(r);
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const { impiantiIds, ...data } = await corpoValidato(
    req,
    conPeriodoValido(contrattoBase.partial()),
  );

  const prima = await prisma.contratto.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!prima) throw new ErroreHttp(404, "Contratto non trovato");
  if (!contrattoModificabile(prima.stato))
    throw new ErroreHttp(
      409,
      "Contratto non modificabile in questo stato: sospenderlo prima di modificarlo",
    );

  const dopo = await prisma.$transaction(async (tx) => {
    if (impiantiIds) {
      // Пълна подмяна на покритието: по-предсказуемо от частично добавяне,
      // а формата и без това праща целия списък.
      await tx.contrattoImpianto.deleteMany({ where: { contrattoId: id } });
      if (impiantiIds.length)
        await tx.contrattoImpianto.createMany({
          data: impiantiIds.map((impiantoId: string) => ({
            contrattoId: id,
            impiantoId,
          })),
        });
    }
    return tx.contratto.update({ where: { id }, data, include });
  });

  await scriviAudit({
    azione: "UPDATE",
    entita: "contratti",
    entitaId: id,
    dettagli: dettagliModifica(prima, { ...prima, ...data }),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});

export const DELETE = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const prima = await prisma.contratto.findFirst({
    where: { id, ...filtroTenant(s) },
    include: { _count: { select: { ordini: true, fatture: true } } },
  });
  if (!prima) throw new ErroreHttp(404, "Contratto non trovato");

  const documenti = prima._count.ordini + prima._count.fatture;
  if (!contrattoEliminabile(prima.stato, documenti))
    throw new ErroreHttp(
      409,
      "Contratto con documenti collegati: non può essere eliminato, disdirlo",
    );

  await prisma.contratto.delete({ where: { id } });
  await scriviAudit({
    azione: "DELETE",
    entita: "contratti",
    entitaId: id,
    dettagli: dettagliCancellazione(prima),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
