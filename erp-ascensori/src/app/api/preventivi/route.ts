// Preventivi: списък + създаване с прогресивен номер PRV-ГГГГ-NNNN.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { preventivoSchema } from "@/lib/entities";

const include = {
  impianto: { select: { matricola: true, indirizzo: true } },
  amministratore: { select: { nome: true, cognome: true, ragioneSociale: true } },
  utente: { select: { nome: true, cognome: true } },
  _count: { select: { voci: true } },
};

export const GET = gestito(async (req) => {
  await richiedeRuolo("OPERATORE");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stato = url.searchParams.get("stato");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));
  const where = {
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" as const } },
            { oggetto: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(stato ? { stato: stato as never } : {}),
  };
  const [righe, totale] = await Promise.all([
    prisma.preventivo.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.preventivo.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const data = await corpoValidato(req, preventivoSchema);
  const creato = await conNumero("preventivo", PREFISSI.preventivo, (numero) =>
    prisma.preventivo.create({
      data: {
        ...data,
        descrizione: data.descrizione ?? undefined,
        note: data.note ?? undefined,
        impiantoId: data.impiantoId ?? undefined,
        amministratoreId: data.amministratoreId ?? undefined,
        numero,
        utenteId: s.sub,
      },
      include,
    })
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "preventivi",
    entitaId: creato.id,
    dettagli: { dopo: data },
    utenteId: s.sub,
  });
  return ok(creato, 201);
});
