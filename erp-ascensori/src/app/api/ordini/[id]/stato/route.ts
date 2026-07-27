// Смяна на статус на ордина — САМО по позволените преходи от workflow таблицата.
// Успешният преход пише редица в storico_stati + audit STATE_CHANGE (в транзакция).

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeSessione, richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { emettiEvento } from "@/lib/webhook/emetti";
import { STATI_ORDINE, transizioneAmmessa, type Stato } from "@/lib/workflow";

const schema = z.object({
  stato: z.enum(STATI_ORDINE),
  nota: z.string().trim().max(500).nullish(),
});

export const PATCH = gestito(async (req, ctx) => {
  // Сесията се иска ПРЕДИ да се чете тялото: иначе анонимен клиент кара сървъра
  // да разбира и валидира произволен JSON, преди да получи 401.
  await richiedeSessione();
  const { stato, nota } = await corpoValidato(req, schema);
  // ANNULLATO и CHIUSO са управленски решения → RESPONSABILE+; останалите — TECNICO+
  const s = await richiedeRuolo(
    stato === "ANNULLATO" || stato === "CHIUSO" ? "RESPONSABILE" : "TECNICO",
  );
  const { id } = await ctx.params;

  const dopo = await prisma.$transaction(async (tx) => {
    // с филтъра по фирма — иначе познат UUID сменя статуса на ЧУЖД ордин
    const ordine = await tx.ordineLavoro.findFirst({
      where: { id, ...filtroTenant(s) },
    });
    if (!ordine) throw new ErroreHttp(404, "Ordine non trovato");
    const da = ordine.stato as Stato;
    if (!transizioneAmmessa(da, stato))
      throw new ErroreHttp(
        409,
        `Transizione non ammessa: da «${da}» a «${stato}»`,
      );
    // Условен запис: пази от състезание — ако друга заявка е сменила статуса
    // междувременно, count===0 и преходът се отказва (без невалиден скок).
    const upd = await tx.ordineLavoro.updateMany({
      where: { id, stato: da },
      data: {
        stato,
        // първото влизане в работа/приключване попълва реалния период
        ...(stato === "IN_LAVORO" && !ordine.dataInizio
          ? { dataInizio: new Date() }
          : {}),
        ...(stato === "COMPLETATO" && !ordine.dataFine
          ? { dataFine: new Date() }
          : {}),
      },
    });
    if (upd.count === 0)
      throw new ErroreHttp(
        409,
        "Stato modificato da un'altra operazione: riprovare",
      );
    await tx.storicoStato.create({
      data: {
        ordineLavoroId: id,
        statoPrecedente: da,
        statoNuovo: stato,
        nota: nota ?? undefined,
        utente: s.nome,
      },
    });
    // audit в СЪЩАТА транзакция: ако записът се провали, преходът се отменя
    await scriviAudit(
      {
        azione: "STATE_CHANGE",
        entita: "ordini_lavoro",
        entitaId: id,
        dettagli: { da, dopo: stato, nota },
        utenteId: s.sub,
        tenantId: s.tenantId,
      },
      tx,
    );
    // Известието се ЗАПИСВА в същата транзакция, но се ПРАЩА от автоматизъм:
    // паднал получател не бива да проваля прехода.
    await emettiEvento(
      "ordine.stato_cambiato",
      { id, numero: ordine.numero, da, a: stato },
      s.tenantId ?? null,
      tx,
    );
    return tx.ordineLavoro.findUniqueOrThrow({ where: { id } });
  });

  return ok(dopo);
});
