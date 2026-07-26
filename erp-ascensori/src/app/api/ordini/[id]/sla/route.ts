// Отметките на часовника: сигнал → пристигане → връщане в служба.
//
// Отделен маршрут, а не поле в общата форма за редакция, по две причини.
//
// ПЪРВО, тези три отметки са ДОКАЗАТЕЛСТВО. По тях се плаща (или не се плаща)
// неустойка по договора, затова всяка промяна влиза в одита като отделно
// събитие с предишната и новата стойност. Скрити между двайсет други полета,
// те биха се сменяли невидимо.
//
// ВТОРО, техникът ги натиска от телефона, застанал пред уредбата — с един бутон,
// не с отваряне на цялата форма.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { calcolaSla, sogliaSiApplica } from "@/lib/sla";

/** `null` е ИЗРИЧНО разрешено: сгрешена отметка трябва да може да се изчисти. */
const schema = z
  .object({
    segnalatoAt: z.coerce.date().nullish(),
    arrivoAt: z.coerce.date().nullish(),
    ripristinoAt: z.coerce.date().nullish(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nessun campo da aggiornare");

const CAMPI = ["segnalatoAt", "arrivoAt", "ripristinoAt"] as const;

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const o = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      priorita: true,
      segnalatoAt: true,
      arrivoAt: true,
      ripristinoAt: true,
      contratto: {
        select: { slaInterventoMin: true, slaRipristinoOre: true },
      },
    },
  });
  if (!o) throw new ErroreHttp(404, "Ordine non trovato");

  return ok({
    tempi: {
      segnalatoAt: o.segnalatoAt,
      arrivoAt: o.arrivoAt,
      ripristinoAt: o.ripristinoAt,
    },
    // Часовникът важи само за спешните: планова поддръжка с време за отзив би
    // оцветила таблото в червено без причина.
    applicabile: sogliaSiApplica(o.priorita),
    sla: calcolaSla(
      o,
      {
        interventoMin: o.contratto?.slaInterventoMin ?? null,
        ripristinoOre: o.contratto?.slaRipristinoOre ?? null,
      },
      new Date(),
    ),
  });
});

export const PATCH = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const dati = await corpoValidato(req, schema);

  const prima = await prisma.ordineLavoro.findFirst({
    where: { id, ...filtroTenant(s) },
    select: {
      id: true,
      segnalatoAt: true,
      arrivoAt: true,
      ripristinoAt: true,
    },
  });
  if (!prima) throw new ErroreHttp(404, "Ordine non trovato");

  // Подредбата е физическа, не административна: не може да си пристигнал преди
  // да са те повикали. Без проверката един объркан час прави отчета за времената
  // безсмислен — и то мълчаливо.
  const dopo = {
    segnalatoAt: dati.segnalatoAt !== undefined ? dati.segnalatoAt : prima.segnalatoAt,
    arrivoAt: dati.arrivoAt !== undefined ? dati.arrivoAt : prima.arrivoAt,
    ripristinoAt:
      dati.ripristinoAt !== undefined ? dati.ripristinoAt : prima.ripristinoAt,
  };
  if (dopo.arrivoAt && dopo.segnalatoAt && dopo.arrivoAt < dopo.segnalatoAt)
    throw new ErroreHttp(
      400,
      "L'arrivo non può precedere la segnalazione",
    );
  if (
    dopo.ripristinoAt &&
    dopo.segnalatoAt &&
    dopo.ripristinoAt < dopo.segnalatoAt
  )
    throw new ErroreHttp(
      400,
      "Il ripristino non può precedere la segnalazione",
    );
  if (dopo.ripristinoAt && dopo.arrivoAt && dopo.ripristinoAt < dopo.arrivoAt)
    throw new ErroreHttp(400, "Il ripristino non può precedere l'arrivo");

  const aggiornato = await prisma.ordineLavoro.update({
    where: { id },
    data: dopo,
  });

  const valori: Record<string, { da?: string; a?: string }> = {};
  for (const c of CAMPI)
    if (prima[c]?.toISOString() !== dopo[c]?.toISOString())
      valori[c] = {
        da: prima[c]?.toISOString(),
        a: dopo[c]?.toISOString(),
      };

  if (Object.keys(valori).length)
    await scriviAudit({
      azione: "UPDATE",
      entita: "ordini_lavoro",
      entitaId: id,
      dettagli: { valori },
      utenteId: s.sub,
      tenantId: s.tenantId,
    });

  return ok({
    segnalatoAt: aggiornato.segnalatoAt,
    arrivoAt: aggiornato.arrivoAt,
    ripristinoAt: aggiornato.ripristinoAt,
  });
});
