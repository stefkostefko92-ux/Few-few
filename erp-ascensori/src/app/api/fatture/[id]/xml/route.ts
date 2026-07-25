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
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { fatturaPerSdi } from "@/lib/sdi/carica";
import { validaPerSdi, xmlFatturaPa, nomeFileSdi } from "@/lib/sdi/fatturapa";

export const GET = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const f = await fatturaPerSdi(id, s.tenantId ?? null);
  if (!f) return errore(404, "Fattura non trovata");

  const problemi = validaPerSdi(f);
  const soloControllo = new URL(req.url).searchParams.get("controlla") === "1";
  if (soloControllo) return ok({ pronta: problemi.length === 0, problemi });

  if (problemi.length)
    // 422: заявката е разбрана, документът просто още не е годен за подаване.
    return NextResponse.json(
      { error: "Fattura non pronta per lo SDI", problemi },
      { status: 422 },
    );

  const nomeFile = nomeFileSdi(f.azienda.partitaIva ?? "", f.progressivoInvio);
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

  const xml = xmlFatturaPa(f);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
