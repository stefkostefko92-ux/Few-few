// Вписване на подаването към Sistema di Interscambio.
//
// Продуктът НЕ подава сам: каналът към SDI (PEC, посредник или уеб порталът на
// Agenzia delle Entrate) е избор на клиента и на неговия счетоводител. Тук се
// вписва фактът, че файлът е тръгнал — от него нататък тече очакването на
// известие, а фактурата вече не е „генерирана".
//
// Обратният път (`GENERATA` → `NON_INVIATA`) е нарочно позволен: подаването е
// човешко вписване и грешката трябва да се поправя, преди да е дошло известие.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import {
  transizioneSdiAmmessa,
  STATI_SDI,
  type StatoSdi,
} from "@/lib/fiscale/sdi-stato";

const schema = z.object({
  stato: z.enum(STATI_SDI),
  identificativoSdi: z.string().trim().max(60).nullish(),
  dataInvio: z.coerce.date().optional(),
});

export const PATCH = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const data = await corpoValidato(req, schema);

  const dopo = await prisma.$transaction(async (tx) => {
    const prima = await tx.fattura.findFirst({
      where: { id, ...filtroTenant(s) },
      select: { statoSdi: true, progressivoInvio: true },
    });
    if (!prima) throw new ErroreHttp(404, "Fattura non trovata");
    const da = prima.statoSdi as StatoSdi;
    if (!transizioneSdiAmmessa(da, data.stato))
      throw new ErroreHttp(
        409,
        `Transizione SDI non ammessa: da «${da}» a «${data.stato}»`,
      );
    if (data.stato === "INVIATA" && !prima.progressivoInvio)
      throw new ErroreHttp(
        409,
        "Nessun XML generato per questa fattura: scaricare prima il file da trasmettere",
      );

    // Условен запис — пази от състезание между две едновременни вписвания.
    const upd = await tx.fattura.updateMany({
      where: { id, statoSdi: da },
      data: {
        statoSdi: data.stato,
        ...(data.identificativoSdi
          ? { identificativoSdi: data.identificativoSdi }
          : {}),
        ...(data.stato === "INVIATA"
          ? { dataInvioSdi: data.dataInvio ?? new Date() }
          : {}),
        // Преиздаването изчиства часовника от предишния отказ.
        ...(data.stato === "GENERATA" ? { scadenzaRinvioSdi: null } : {}),
      },
    });
    if (upd.count === 0)
      throw new ErroreHttp(
        409,
        "Stato modificato da un'altra operazione: riprovare",
      );
    return tx.fattura.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        numero: true,
        statoSdi: true,
        identificativoSdi: true,
        dataInvioSdi: true,
        scadenzaRinvioSdi: true,
      },
    });
  });

  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: { valori: { statoSdi: { a: data.stato } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(dopo);
});
