// Contratti di manutenzione: списък + създаване с прогресивен номер CTR-ГГГГ-NNNN.
//
// Договорът е източникът на приходите: от него автоматизмът ражда ордини за
// периодичните посещения и фактури за canone-то. Затова създаването веднага
// изчислява ПЪРВИТЕ дати на двата графика — иначе договорът стои „активен",
// но нищо не се случва.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { dettagliCreazione } from "@/lib/audit-dettagli";
import { conNumero } from "@/lib/numerazione";
import { contrattoSchema } from "@/lib/entities";
import { paginazione, testoParam, enumParam } from "@/lib/query";
import { STATI_CONTRATTO } from "@/lib/regole-contratti";

const include = {
  amministratore: { select: { nome: true, cognome: true, ragioneSociale: true } },
  condominio: { select: { nome: true, citta: true } },
  _count: { select: { impianti: true, ordini: true, fatture: true } },
};

export const GET = gestito(async (req) => {
  const s = await richiedeRuolo("OPERATORE");
  const url = new URL(req.url);
  const q = testoParam(url);
  const stato = enumParam(url, "stato", STATI_CONTRATTO);
  const { page, size, skip, take } = paginazione(url);

  const where = {
    ...filtroTenant(s),
    ...(stato ? { stato } : {}),
    ...(q
      ? {
          OR: [
            { numero: { contains: q, mode: "insensitive" as const } },
            { oggetto: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [righe, totale] = await Promise.all([
    prisma.contratto.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.contratto.count({ where }),
  ]);
  return ok({ righe, totale, page, size });
});

export const POST = gestito(async (req) => {
  // Договорът обвързва фирмата финансово за години напред → RESPONSABILE+.
  const s = await richiedeRuolo("RESPONSABILE");
  const { impiantiIds, ...data } = await corpoValidato(req, contrattoSchema);

  const creato = await conNumero("contratto", "CTR", s.tenantId, (numero) =>
    prisma.contratto.create({
      data: {
        ...data,
        numero,
        note: data.note ?? undefined,
        amministratoreId: data.amministratoreId ?? undefined,
        condominioId: data.condominioId ?? undefined,
        // Двата графика тръгват от началото на договора. Автоматизмът ги мести
        // напред само след успешно раждане, значи нищо не се губи, ако cron-ът
        // е спрял — наваксва се.
        prossimaVisita: data.dataInizio,
        prossimaFattura: data.dataInizio,
        ...(impiantiIds?.length
          ? { impianti: { create: impiantiIds.map((impiantoId: string) => ({ impiantoId })) } }
          : {}),
        ...tenantDiCreazione(s),
      },
      include,
    }),
  );

  await scriviAudit({
    azione: "CREATE",
    entita: "contratti",
    entitaId: creato.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(creato, 201);
});
