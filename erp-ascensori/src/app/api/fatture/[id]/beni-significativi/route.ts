// Разцепването 10 %/22 % по правилото за значимите блага.
//
// GET  → какво ще излезе, без да се пипа нищо (операторът вижда числата преди
//        да реши).
// POST → ПРЕПИСВА редовете на фактурата с трите законови реда. Само по
//        чернова: издаден документ не се пренарежда.
//
// Защо изобщо е действие, а не тиха сметка при печат: чл. 1, ал. 19 от закон
// 205/2017 иска стойността на значимото благо и на престацията да са ИЗРИЧНО
// посочени във фактурата. Без разбивката намалената ставка не се признава —
// тоест числата трябва да са в самите редове, не в бележка под линия.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { ricalcolaFattura } from "@/lib/totali-db";
import { fatturaEliminabile } from "@/lib/regole-fiscali";
import {
  baseImponibili,
  ripartizioneBeniSignificativi,
  righeRipartite,
  problemiBeniSignificativi,
  type VoceConFlag,
} from "@/lib/fiscale/beni-significativi";
import { fromCents } from "@/lib/totals";

async function vociDi(
  id: string,
  s: Awaited<ReturnType<typeof richiedeRuolo>>,
) {
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    include: { voci: { orderBy: { ordine: "asc" } } },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  const voci: VoceConFlag[] = f.voci.map((v) => ({
    descrizione: v.descrizione,
    quantita: v.quantita.toString(),
    prezzoUnitario: v.prezzoUnitario.toString(),
    aliquotaIva: v.aliquotaIva.toString(),
    beneSignificativo: v.beneSignificativo,
  }));
  return { f, voci };
}

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const { voci } = await vociDi(id, s);
  const basi = baseImponibili(voci);
  const r = ripartizioneBeniSignificativi(
    basi.prestazione,
    basi.beneSignificativo,
  );
  return ok({
    prestazione: fromCents(r.prestazione),
    beneSignificativo: fromCents(r.beneSignificativo),
    imponibileAgevolato: fromCents(r.imponibileAgevolato),
    imponibileOrdinario: fromCents(r.imponibileOrdinario),
    eccedenza: r.eccedenza,
    problemi: problemiBeniSignificativi(voci),
    anteprima: righeRipartite(voci),
  });
});

export const POST = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const { f, voci } = await vociDi(id, s);
  if (!fatturaEliminabile(f.stato))
    throw new ErroreHttp(
      409,
      "Fattura già emessa: le righe non sono più modificabili",
    );

  const problemi = problemiBeniSignificativi(voci);
  if (problemi.length) throw new ErroreHttp(422, problemi.join(" "));

  const nuove = righeRipartite(voci);
  if (nuove.length === 0)
    throw new ErroreHttp(422, "Nessuna riga da ripartire");

  await prisma.$transaction(async (tx) => {
    await tx.voceFattura.deleteMany({ where: { fatturaId: id } });
    await tx.voceFattura.createMany({
      data: nuove.map((r, i) => ({
        fatturaId: id,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzoUnitario: r.prezzoUnitario,
        aliquotaIva: r.aliquotaIva,
        beneSignificativo: r.beneSignificativo,
        ordine: i,
      })),
    });
    await tx.fattura.update({
      where: { id },
      data: { regimeBeniSignificativi: true },
    });
    await ricalcolaFattura(id, tx);
  });

  const dopo = await prisma.fattura.findUniqueOrThrow({
    where: { id },
    include: { voci: { orderBy: { ordine: "asc" } } },
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "fatture",
    entitaId: id,
    dettagli: {
      beniSignificativi: {
        righe: nuove.length,
        totale: String(dopo.totaleLordo),
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});
