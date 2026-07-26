// FatturaPA XML за Sistema di Interscambio.
//
// Две различни неща зад един маршрут:
//   • `?controlla=1` → само проверка на реквизитите (какво липсва, на италиански);
//   • без параметър   → самият файл, ако документът е готов.
//
// Черновата НЕ се изнася: подаден в SDI документ вече е издаден и номерът му е
// изразходван (чл. 21, ал. 2 D.P.R. 633/1972). Излизането от чернова минава
// през прехода на състоянието, който пише в одита — не през бутон „изтегли".

import { gestito, errore, ok } from "@/lib/api";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { fatturaPerSdi, prossimoProgressivo } from "@/lib/sdi/carica";
import {
  controllaPerSdi,
  xmlFatturaPa,
  nomeFileSdi,
  totaliSdi,
} from "@/lib/sdi/fatturapa";
import { transizioneSdiAmmessa, type StatoSdi } from "@/lib/fiscale/sdi-stato";
import { fromCents } from "@/lib/totals";

export const GET = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const f = await fatturaPerSdi(id, s.tenantId ?? null);
  if (!f) return errore(404, "Fattura non trovata");

  const { problemi, avvisi } = controllaPerSdi(f);
  const t = totaliSdi(f);
  const soloControllo = new URL(req.url).searchParams.get("controlla") === "1";
  if (soloControllo)
    return ok({
      pronta: problemi.length === 0,
      problemi,
      avvisi,
      totali: {
        imponibile: fromCents(t.imponibile),
        imposta: fromCents(t.imposta),
        ritenuta: fromCents(t.ritenuta),
        totaleDocumento: fromCents(t.importoTotaleDocumento),
        daPagare: fromCents(t.importoPagamento),
      },
    });

  if (problemi.length)
    // 422: заявката е разбрана, документът просто още не е годен за подаване.
    return NextResponse.json(
      { error: "Fattura non pronta per lo SDI", problemi, avvisi },
      { status: 422 },
    );

  // Прогресивният код се тегли ВЕДНЪЖ и остава върху документа. Преиздаването
  // след отказ трябва да носи същото име на файл — иначе SDI вижда нов
  // документ, а не поправения стар.
  const progressivo =
    f.progressivoInvio ||
    (await prisma.$transaction(async (tx) => {
      const attuale = await tx.fattura.findUniqueOrThrow({
        where: { id },
        select: { progressivoInvio: true, statoSdi: true },
      });
      // Второ четене вътре в транзакцията: между проверката горе и тук друга
      // заявка може вече да е замразила кода.
      if (attuale.progressivoInvio) return attuale.progressivoInvio;
      const nuovo = await prossimoProgressivo(s.tenantId ?? null, tx);
      const da = attuale.statoSdi as StatoSdi;
      await tx.fattura.update({
        where: { id },
        data: {
          progressivoInvio: nuovo,
          // Само когато преходът е позволен: вече доставен документ не се
          // връща в „генериран" от повторно сваляне на файла.
          ...(transizioneSdiAmmessa(da, "GENERATA")
            ? { statoSdi: "GENERATA" as const }
            : {}),
        },
      });
      return nuovo;
    }));

  const nomeFile = nomeFileSdi(f.azienda.partitaIva ?? "", progressivo);
  // Изнасянето на фискален документ е събитие: то предхожда подаването и е
  // единствената следа, ако после възникне спор кога е изготвен файлът.
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "fatture",
    entitaId: id,
    dettagli: { esportazione: "SDI", file: nomeFile },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  const xml = xmlFatturaPa({ ...f, progressivoInvio: progressivo });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
