// Fatture: активен (EMESSA/FT) и пасивен (RICEVUTA/FR) цикъл в една таблица.
// Икономическите данни са видими от DIREZIONE нагоре (гл. Controlli).

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { fatturaSchema } from "@/lib/entities";

const include = {
  amministratore: { select: { nome: true, cognome: true, ragioneSociale: true } },
  ordineLavoro: { select: { numero: true } },
  utente: { select: { nome: true, cognome: true } },
  _count: { select: { voci: true } },
};

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("DIREZIONE");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const tipo = url.searchParams.get("tipo");
  const stato = url.searchParams.get("stato");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));
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
    ...(tipo ? { tipo: tipo as never } : {}),
    ...(stato ? { stato: stato as never } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.fattura.findMany({
      where,
      include,
      orderBy: { data: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.fattura.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("DIREZIONE");
  const data = await corpoValidato(req, fatturaSchema);
  const prefisso = data.tipo === "RICEVUTA" ? PREFISSI.fatturaRicevuta : PREFISSI.fatturaEmessa;
  const creato = await conNumero("fattura", prefisso, (numero) =>
    prisma.fattura.create({
      data: {
        tipo: data.tipo,
        data: data.data,
        dataScadenza: data.dataScadenza ?? undefined,
        oggetto: data.oggetto ?? undefined,
        amministratoreId: data.amministratoreId ?? undefined,
        ordineLavoroId: data.ordineLavoroId ?? undefined,
        note: data.note ?? undefined,
        numero,
        utenteId: s.sub,
        ...tenantDiCreazione(s),
      },
      include,
    })
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "fatture",
    entitaId: creato.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
  });
  return ok(creato, 201);
});
