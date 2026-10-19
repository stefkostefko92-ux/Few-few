// Оферта → фактура в чернова с редовете на офертата.
//
// Повече от една е позволено: аванс и салдо са две фактури на една оферта.
// Затова тук няма отказ при съществуваща — интерфейсът показва вече издадените
// и пита, преди да създаде нова.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import {
  STATO_PREVENTIVO_GENERABILE,
  vociDaPreventivo,
} from "@/lib/genera-documenti";
import { nuovaFatturaBozza } from "@/lib/genera-db";

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const p = await prisma.preventivo.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      numero: true,
      stato: true,
      oggetto: true,
      amministratoreId: true,
      impianto: { select: { condominioId: true } },
      ordiniLavoro: { select: { id: true }, take: 1 },
      voci: {
        select: {
          descrizione: true,
          quantita: true,
          prezzoUnitario: true,
          aliquotaIva: true,
          naturaIva: true,
          ordine: true,
        },
      },
    },
  });
  if (!p) throw new ErroreHttp(404, "Preventivo non trovato");
  if (p.stato !== STATO_PREVENTIVO_GENERABILE)
    throw new ErroreHttp(
      409,
      "Solo un preventivo approvato dal cliente si fattura",
    );
  if (p.voci.length === 0)
    throw new ErroreHttp(409, "Il preventivo non ha righe da fatturare");

  const voci = vociDaPreventivo(
    p.voci.map((v) => ({
      ...v,
      quantita: v.quantita.toString(),
      prezzoUnitario: v.prezzoUnitario.toString(),
      aliquotaIva: v.aliquotaIva.toString(),
    })),
  );
  const f = await nuovaFatturaBozza(
    s,
    {
      oggetto: p.oggetto,
      condominioId: p.impianto?.condominioId ?? null,
      amministratoreId: p.amministratoreId,
      ordineLavoroId: p.ordiniLavoro[0]?.id ?? null,
      preventivoId: p.id,
    },
    voci,
    `preventivo ${p.numero}`,
  );
  return ok(f, 201);
});
