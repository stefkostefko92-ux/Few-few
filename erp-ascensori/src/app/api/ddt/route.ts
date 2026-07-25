// DDT (D.P.R. 472/1996): списък + създаване с номер DDT-ГГГГ-NNNN.
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { conNumero, PREFISSI } from "@/lib/numerazione";
import { ddtSchema } from "@/lib/entities";

const include = {
  ordineLavoro: { select: { numero: true } },
  _count: { select: { righe: true, movimenti: true } },
};

export const GET = gestito(async (req) => {
  await richiedeRuolo("OPERATORE");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));
  const where = q
    ? {
        OR: [
          { numero: { contains: q, mode: "insensitive" as const } },
          { destinatario: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [righe, totale] = await Promise.all([
    prisma.ddt.findMany({
      where,
      include,
      orderBy: { data: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.ddt.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const data = await corpoValidato(req, ddtSchema.base);
  const creato = await conNumero("ddt", PREFISSI.ddt, (numero) =>
    prisma.ddt.create({
      data: {
        data: data.data,
        causale: data.causale ?? undefined,
        destinatario: data.destinatario ?? undefined,
        indirizzoConsegna: data.indirizzoConsegna ?? undefined,
        vettore: data.vettore ?? undefined,
        ordineLavoroId: data.ordineLavoroId ?? undefined,
        note: data.note ?? undefined,
        numero,
      },
      include,
    })
  );
  await scriviAudit({
    azione: "CREATE",
    entita: "ddt",
    entitaId: creato.id,
    dettagli: { dopo: data },
    utenteId: s.sub,
  });
  return ok(creato, 201);
});
