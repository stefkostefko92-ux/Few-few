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
import {
  CONTROLLI_ART15,
  richiedeFermo,
  valutaControlli,
  problemiRapportino,
} from "@/lib/normativa/verifiche";

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
    select: { id: true, impiantoId: true },
  });
  if (!ordine) throw new ErroreHttp(404, "Ordine non trovato");

  const creato = await conNumero("rapportino", "RAP", s.tenantId, (numero) =>
    prisma.rapportino.create({
      data: {
        ...data,
        numero,
        ordineLavoroId: id,
        // Уредбата се записва ПРЯКО. Историята на един асансьор е негова, не на
        // поръчката: при проверка се иска всичко правено по ТАЗИ уредба.
        impiantoId: ordine.impiantoId ?? undefined,
        materiali: data.materiali ?? undefined,
        noteInterne: data.noteInterne ?? undefined,
        tecnicoId: data.tecnicoId ?? undefined,
        ...tenantDiCreazione(s),
      },
      include,
    }),
  );

  // Открита критична неизправност значи спиране на уредбата, не забележка в
  // текста. Спирането е в СЪЩАТА транзакция би било по-добре, но записът вече е
  // минал: затова тук се прави веднага след него и се вписва в одита отделно.
  const controlli = Object.fromEntries(
    CONTROLLI_ART15.map((c) => [
      c.campo,
      (data as Record<string, unknown>)[c.campo],
    ]),
  );
  let fermato = false;
  if (ordine.impiantoId && richiedeFermo(controlli)) {
    const agg = await prisma.impianto.updateMany({
      // Изведена от служба или вече спряна по закон уредба не се пипа: първото
      // би скрило истинската ѝ съдба, второто е без ефект.
      where: {
        id: ordine.impiantoId,
        ...filtroTenant(s),
        stato: { notIn: ["DISMESSO", "FERMO_AMMINISTRATIVO"] },
      },
      data: { stato: "FERMO" },
    });
    fermato = agg.count > 0;
    if (fermato)
      await scriviAudit({
        azione: "STATE_CHANGE",
        entita: "impianti",
        entitaId: ordine.impiantoId,
        dettagli: {
          motivo: "controlli critici non conformi",
          controlli: valutaControlli(controlli).difformiCritici,
        },
        utenteId: s.sub,
        tenantId: s.tenantId,
      });
  }

  await scriviAudit({
    azione: "CREATE",
    entita: "rapportini",
    entitaId: creato.id,
    dettagli: dettagliCreazione(data),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  // Забележките не блокират — техникът трябва да може да запише каквото е
  // заварил. Връщат се, за да ги ВИДИ, вместо да ги научи от контрола.
  return ok(
    {
      ...creato,
      impiantoFermato: fermato,
      avvisi: problemiRapportino({
        tipoIntervento: data.tipoIntervento ?? "MANUTENZIONE_ORDINARIA",
        esito: data.esito ?? "RISOLTO",
        controlli,
      }),
    },
    201,
  );
});
