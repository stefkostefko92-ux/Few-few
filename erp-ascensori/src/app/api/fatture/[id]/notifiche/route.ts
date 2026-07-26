// Известия от Sistema di Interscambio.
//
// Известието е ДОКАЗАТЕЛСТВОТО. Наша таблица може да твърди каквото си иска —
// при проверка тежи то. Затова известията се вписват и не се менят: няма PUT,
// няма DELETE. Грешно вписано известие се поправя с ново.
//
// Статусът на фактурата се ИЗВЕЖДА от вписаното, а не се задава на ръка. Най-
// важната последица е при отказ (NS): документът се смята за НЕИЗДАДЕН, номерът
// му остава свободен, а срокът за преиздаване със същия номер и дата е 5 дни.

import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { notificaSdiSchema } from "@/lib/entities";
import { emettiEvento } from "@/lib/webhook/emetti";
import {
  statoDaNotifica,
  scadenzaRinvio,
  transizioneSdiAmmessa,
  type StatoSdi,
} from "@/lib/fiscale/sdi-stato";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { id: true },
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  const righe = await prisma.notificaSdi.findMany({
    where: { fatturaId: id },
    orderBy: { dataOra: "asc" },
  });
  return ok({ righe });
});

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, notificaSdiSchema);
  const nuovo = statoDaNotifica(data.tipo, data.esito);

  const esito = await prisma.$transaction(async (tx) => {
    const f = await tx.fattura.findFirst({
      where: { id, ...filtroTenant(s) },
      select: {
        id: true,
        numero: true,
        statoSdi: true,
        progressivoInvio: true,
      },
    });
    if (!f) throw new ErroreHttp(404, "Fattura non trovata");

    const da = f.statoSdi as StatoSdi;
    // Известието се вписва ВИНАГИ — то е факт, дошъл отвън. Отхвърляме само
    // безсмислените случаи, в които документът още не е тръгвал.
    if (da === "NON_INVIATA" && data.tipo !== "AT")
      throw new ErroreHttp(
        409,
        "La fattura non risulta trasmessa: registrare prima la trasmissione allo SDI",
      );

    const dataOra = data.dataOra ?? new Date();
    const notifica = await tx.notificaSdi.create({
      data: {
        fatturaId: id,
        tipo: data.tipo,
        identificativoSdi: data.identificativoSdi ?? undefined,
        dataOra,
        descrizione: data.descrizione ?? undefined,
        errori: data.errori ?? undefined,
        nomeFile: data.nomeFile ?? undefined,
        ...tenantDiCreazione(s),
      },
    });

    // Известие, което не мени съдбата на документа (напр. второ RC), не бива
    // да го връща назад по машината на състоянията.
    const cambia = nuovo !== da && transizioneSdiAmmessa(da, nuovo);
    if (cambia)
      await tx.fattura.update({
        where: { id },
        data: {
          statoSdi: nuovo,
          identificativoSdi:
            data.identificativoSdi ?? f.progressivoInvio ?? undefined,
          // Часовникът тръгва от известието, не от днес.
          scadenzaRinvioSdi:
            nuovo === "SCARTATA" ? scadenzaRinvio(dataOra) : null,
        },
      });

    if (cambia && (nuovo === "SCARTATA" || nuovo === "CONSEGNATA"))
      await emettiEvento(
        nuovo === "SCARTATA" ? "fattura.scartata" : "fattura.consegnata",
        {
          id,
          numero: f.numero,
          statoSdi: nuovo,
          // Кодовете на грешките влизат в известието към счетоводството: без
          // тях получателят знае само че е отказана, но не и защо.
          errori: (data.errori ?? []).map((e) => ({
            codice: e.codice ?? "",
            descrizione: e.descrizione ?? "",
          })),
        },
        s.tenantId ?? null,
        tx,
      );
    return { notifica, statoSdi: cambia ? nuovo : da, cambia };
  });

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: {
      notificaSdi: data.tipo,
      esito: data.esito ?? null,
      statoSdi: esito.statoSdi,
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(esito, 201);
});
