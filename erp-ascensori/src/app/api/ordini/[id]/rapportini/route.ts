// Отчети за намесата по един ордин: списък + създаване.
//
// Създава го ТЕХНИКЪТ на място, затова прагът е TECNICO, а не OPERATORE:
// това е неговият документ и неговите часове.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { conNumero } from "@/lib/numerazione";
import { rapportinoSchema } from "@/lib/entities";

const include = {
  tecnico: { select: { nome: true, cognome: true } },
};

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const righe = await prisma.rapportino.findMany({
    where: { ordineLavoroId: id, ...filtroTenant(s) },
    include,
    orderBy: { dataOra: "desc" },
  });
  return ok({ righe, totale: righe.length });
});

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, rapportinoSchema);

  // Ордин на друга фирма не приема отчети.
  const ordine = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true },
  });
  if (!ordine) throw new ErroreHttp(404, "Ordine non trovato");

  const creato = await conNumero("rapportino", "RAP", s.tenantId, (numero) =>
    prisma.rapportino.create({
      data: {
        ...data,
        numero,
        ordineLavoroId: id,
        materiali: data.materiali ?? undefined,
        noteInterne: data.noteInterne ?? undefined,
        tecnicoId: data.tecnicoId ?? undefined,
        ...tenantDiCreazione(s),
      },
      include,
    }),
  );

  await scriviAudit({
    azione: "CREATE",
    entita: "rapportini",
    entitaId: creato.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
