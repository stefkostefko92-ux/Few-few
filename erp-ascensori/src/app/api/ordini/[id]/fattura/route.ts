// Ордин → фактура в чернова.
//
// Редовете: на офертата, ако ордина идва от оферта (договорената цена);
// иначе вложените материали по продажна цена. Часовете НЕ стават ред —
// цената на часа за клиента не е в базата (`costoOrario` е разходът на
// фирмата, не тарифа), а измислена тарифа е по-лоша от липсващ ред.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { vociDaPreventivo, vociDaMateriali } from "@/lib/genera-documenti";
import { materialiDellOrdine, nuovaFatturaBozza } from "@/lib/genera-db";

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const o = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      numero: true,
      stato: true,
      oggetto: true,
      contrattoId: true,
      impianto: { select: { condominioId: true, amministratoreId: true } },
      preventivo: {
        select: {
          id: true,
          amministratoreId: true,
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
      },
    },
  });
  if (!o) throw new ErroreHttp(404, "Ordine non trovato");
  if (o.stato === "ANNULLATO" || o.stato === "BOZZA")
    throw new ErroreHttp(
      409,
      o.stato === "BOZZA"
        ? "L'ordine è ancora in bozza: emetterlo prima di fatturarlo"
        : "Un ordine annullato non si fattura",
    );

  let voci;
  let senzaPrezzo: string[] = [];
  if (o.preventivo?.voci.length) {
    voci = vociDaPreventivo(
      o.preventivo.voci.map((v) => ({
        ...v,
        quantita: v.quantita.toString(),
        prezzoUnitario: v.prezzoUnitario.toString(),
        aliquotaIva: v.aliquotaIva.toString(),
      })),
    );
  } else {
    const m = vociDaMateriali(await materialiDellOrdine(s, o.id));
    voci = m.voci;
    senzaPrezzo = m.senzaPrezzo;
  }

  const f = await nuovaFatturaBozza(
    s,
    {
      oggetto: o.oggetto,
      condominioId: o.impianto?.condominioId ?? null,
      amministratoreId:
        o.preventivo?.amministratoreId ?? o.impianto?.amministratoreId ?? null,
      ordineLavoroId: o.id,
      preventivoId: o.preventivo?.id ?? null,
      contrattoId: o.contrattoId,
    },
    voci,
    `ordine ${o.numero}`,
  );
  return ok({ ...f, righe: voci.length, senzaPrezzo }, 201);
});
