// Оферта → ордин: приетата оферта ражда ордина си с едно натискане.
// Един ордин на оферта: вторият би дублирал работата (и материалите по нея).

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { STATO_PREVENTIVO_GENERABILE } from "@/lib/genera-documenti";

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const p = await prisma.preventivo.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      numero: true,
      stato: true,
      oggetto: true,
      descrizione: true,
      impiantoId: true,
      ordiniLavoro: { select: { id: true, numero: true }, take: 1 },
    },
  });
  if (!p) throw new ErroreHttp(404, "Preventivo non trovato");
  if (p.stato !== STATO_PREVENTIVO_GENERABILE)
    throw new ErroreHttp(
      409,
      "Solo un preventivo approvato dal cliente genera l'ordine di lavoro",
    );
  if (p.ordiniLavoro.length)
    throw new ErroreHttp(
      409,
      `Ordine di lavoro già generato: ${p.ordiniLavoro[0].numero}`,
    );

  const creato = await conNumero(
    "ordineLavoro",
    PREFISSI.ordineLavoro,
    s.tenantId,
    (numero) =>
      prisma.$transaction(async (tx) => {
        const o = await tx.ordineLavoro.create({
          data: {
            numero,
            oggetto: p.oggetto,
            descrizione: p.descrizione ?? undefined,
            impiantoId: p.impiantoId ?? undefined,
            preventivoId: p.id,
            ...tenantDiCreazione(s),
          },
          select: { id: true, numero: true },
        });
        await tx.storicoStato.create({
          data: { ordineLavoroId: o.id, statoNuovo: "BOZZA", utente: s.nome },
        });
        return o;
      }),
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "ordini_lavoro",
    entitaId: creato.id,
    dettagli: {
      campi: ["origine"],
      valori: { origine: `preventivo ${p.numero}` },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
