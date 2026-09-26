// Достъп и преносимост (чл. 15 и 20 GDPR).
//
// JSON, не PDF: чл. 20 иска „структуриран, широко използван и машинно четим"
// формат, а PDF не е нито едно от трите.

import { gestito, errore } from "@/lib/api";
import { NextResponse } from "next/server";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { esporta } from "@/lib/gdpr/dati";
import { TIPI_SOGGETTO, type TipoSoggetto } from "@/lib/gdpr/piano";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("ADMIN");
  const { tipo, id } = (await ctx.params) as { tipo: string; id: string };
  if (!(TIPI_SOGGETTO as readonly string[]).includes(tipo))
    throw new ErroreHttp(400, "Tipo di soggetto non valido");

  const dati = await esporta(
    tipo as TipoSoggetto,
    id,
    s.tenantId ?? null,
    s.ruolo === "MASTER",
  );
  if (!dati) return errore(404, "Soggetto non trovato");

  // Самото упражняване на правото е събитие: чл. 30(2) иска да се знае кой е
  // изнасял лични данни, кога и за кого.
  await scriviAudit({
    azione: "IMPORT",
    entita: `gdpr:${tipo}`,
    entitaId: id,
    dettagli: { operazione: "esportazione art. 15/20" },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return new NextResponse(JSON.stringify(dati, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gdpr-${tipo}-${id.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
