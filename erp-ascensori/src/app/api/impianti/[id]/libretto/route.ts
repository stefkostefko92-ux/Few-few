// „Libretto d'impianto“ — досието на един асансьор в PDF.
//
// Това е документът, който се подава на контролния орган или на новия
// администратор при смяна. Дотук същите данни се събираха на ръка от четири
// страници.

import { gestito, errore } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { caricaLibretto, generaLibretto } from "@/lib/pdf/libretto";
import { rispostaPdf } from "@/lib/pdf/risposta";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  const dati = await caricaLibretto(id, s.tenantId ?? null);
  if (!dati) return errore(404, "Impianto non trovato");

  // Досието носи цялата история на уредбата — включително имената на техниците.
  // Изнасянето му е събитие, което трябва да се вижда в регистъра.
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "impianti",
    entitaId: id,
    dettagli: { esportazione: "libretto", verifiche: dati.verifiche.length },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  const nome = `libretto-${dati.impianto.matricolaComune ?? dati.impianto.matricola}.pdf`;
  return rispostaPdf(await generaLibretto(dati), nome.replace(/[^\w.-]/g, "-"));
});
