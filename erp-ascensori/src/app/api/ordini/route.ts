// Ordini di lavoro: списък + създаване (BOZZA) с номер ODL-ГГГГ-NNNN.
// Създаването пише и първата редица в storico_stati (statoPrecedente = NULL).

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { ordineSchema } from "@/lib/entities";

const include = {
  impianto: { select: { matricola: true, indirizzo: true } },
  tecnico: { select: { nome: true, cognome: true } },
  cottimista: { select: { ragioneSociale: true } },
  squadra: { select: { nome: true } },
  preventivo: { select: { numero: true } },
};

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("TECNICO");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stato = url.searchParams.get("stato");
  const priorita = url.searchParams.get("priorita");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50),
  );
  const where = {
    ...filtroTenant(s),
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" as const } },
            { oggetto: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(stato ? { stato: stato as never } : {}),
    ...(priorita ? { priorita: priorita as never } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.ordineLavoro.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.ordineLavoro.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const data = await corpoValidato(req, ordineSchema);
  const creato = await conNumero(
    "ordineLavoro",
    PREFISSI.ordineLavoro,
    s.tenantId,
    (numero) =>
      prisma.$transaction(async (tx) => {
        const o = await tx.ordineLavoro.create({
          data: {
            oggetto: data.oggetto,
            priorita: data.priorita,
            descrizione: data.descrizione ?? undefined,
            noteInterne: data.noteInterne ?? undefined,
            noteCommittente: data.noteCommittente ?? undefined,
            dataInizio: data.dataInizio ?? undefined,
            dataFine: data.dataFine ?? undefined,
            impiantoId: data.impiantoId ?? undefined,
            preventivoId: data.preventivoId ?? undefined,
            tecnicoId: data.tecnicoId ?? undefined,
            cottimistiId: data.cottimistiId ?? undefined,
            squadraId: data.squadraId ?? undefined,
            numero,
            ...tenantDiCreazione(s),
          },
          include,
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
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
