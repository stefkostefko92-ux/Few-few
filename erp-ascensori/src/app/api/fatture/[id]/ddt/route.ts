// Кои доставки покрива фактурата (отложено фактуриране, TD24).
//
// Асансьорна фирма вози части през целия месец и издава ЕДНА фактура. Режимът
// е по чл. 21, ал. 4, б. „а" D.P.R. 633/1972 и иска съпровождащите документи
// да са ВЪВ фактурата, не само в папката.
//
// Връзката е това, което ПРАВИ фактурата отложена: типът на документа за SDI
// се извежда от нея (`carica.ts`), а не от отметка, която някой забравя да
// сложи. Затова връзването е достъпно само докато фактурата е чернова —
// подадената фактура вече носи типа, с който е издадена.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp, type Sessione } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";

const schema = z.object({
  /** Пълният списък след промяната — не „добави един". */
  ddtIds: z.array(z.string().uuid()).max(500),
});

async function fatturaModificabile(id: string, s: Sessione) {
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true, numero: true, stato: true },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  if (f.stato !== "BOZZA")
    throw new ErroreHttp(
      409,
      "Fattura non in bozza: i DDT di riferimento non sono più modificabili",
    );
  return f;
}

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true, stato: true },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");

  const [collegati, disponibili] = await Promise.all([
    prisma.ddt.findMany({
      where: { fatturaId: id, ...filtroTenant(s) },
      select: { id: true, numero: true, data: true, destinatario: true },
      orderBy: { data: "asc" },
    }),
    // Свободните доставки: нефактурирани. Точно това е справката, която някой
    // прави на ръка в края на месеца.
    prisma.ddt.findMany({
      where: { fatturaId: null, ...filtroTenant(s) },
      select: { id: true, numero: true, data: true, destinatario: true },
      orderBy: { data: "desc" },
      take: 200,
    }),
  ]);

  return ok({ collegati, disponibili, modificabile: f.stato === "BOZZA" });
});

export const PUT = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const { ddtIds } = await corpoValidato(req, schema);
  const fattura = await fatturaModificabile(id, s);

  await prisma.$transaction(async (tx) => {
    if (ddtIds.length) {
      // Един DDT се фактурира НАЙ-МНОГО веднъж. Проверката е тук, защото схемата
      // не може да я изрази: `fatturaId` е обикновена връзка, а двойно
      // фактурирана доставка значи два пъти платена от клиента.
      const occupati = await tx.ddt.count({
        where: {
          id: { in: ddtIds },
          fatturaId: { not: null, notIn: [id] },
          ...filtroTenant(s),
        },
      });
      if (occupati > 0)
        throw new ErroreHttp(
          409,
          "Uno o più DDT sono già collegati a un'altra fattura",
        );

      // С филтъра по фирма: иначе познат UUID закача ЧУЖДА доставка.
      const nostri = await tx.ddt.count({
        where: { id: { in: ddtIds }, ...filtroTenant(s) },
      });
      if (nostri !== ddtIds.length)
        throw new ErroreHttp(404, "DDT non trovato");
    }

    // Първо се разкача всичко, после се закача новото: така махнатите доставки
    // се освобождават и могат да влязат в друга фактура.
    await tx.ddt.updateMany({
      where: { fatturaId: id },
      data: { fatturaId: null },
    });
    if (ddtIds.length)
      await tx.ddt.updateMany({
        where: { id: { in: ddtIds } },
        data: { fatturaId: id },
      });
  });

  await scriviAudit({
    azione: "UPDATE",
    entita: "fatture",
    entitaId: id,
    dettagli: {
      valori: {
        ddtCollegati: { a: String(ddtIds.length) },
        // Типът се сменя със самото връзване — това е фискален факт и трябва
        // да се вижда в одита, а не да се извежда наум по-късно.
        tipoDocumento: { a: ddtIds.length ? "TD24" : "TD01" },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok({ collegati: ddtIds.length, numero: fattura.numero });
});
