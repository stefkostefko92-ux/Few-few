// Ордин → DDT с вложените материали (стоката, която е излязла към обекта).
//
// Движенията на склада вече са записани от рапортините: DDT-то е документът
// за превоза, не второ изписване — затова тук НЕ се пипа наличността.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { righeDdtDaMateriali } from "@/lib/genera-documenti";
import { materialiDellOrdine } from "@/lib/genera-db";

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const o = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      numero: true,
      impianto: {
        select: {
          indirizzo: true,
          condominio: { select: { nome: true } },
        },
      },
    },
  });
  if (!o) throw new ErroreHttp(404, "Ordine non trovato");
  const righe = righeDdtDaMateriali(await materialiDellOrdine(s, o.id));
  if (righe.length === 0)
    throw new ErroreHttp(
      409,
      "Nessun materiale registrato nei rapportini di questo ordine",
    );

  const creato = await conNumero("ddt", PREFISSI.ddt, s.tenantId, (numero) =>
    prisma.$transaction(async (tx) => {
      const d = await tx.ddt.create({
        data: {
          numero,
          causale: "Materiali per intervento",
          destinatario: o.impianto?.condominio?.nome ?? undefined,
          indirizzoConsegna: o.impianto?.indirizzo ?? undefined,
          ordineLavoroId: o.id,
          ...tenantDiCreazione(s),
        },
        select: { id: true, numero: true },
      });
      await tx.rigaDdt.createMany({
        data: righe.map((r) => ({ ...r, ddtId: d.id })),
      });
      return d;
    }),
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "ddt",
    entitaId: creato.id,
    dettagli: { campi: ["origine"], valori: { origine: `ordine ${o.numero}` } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
