// Обобщението за панела „Amministrazione" — ЕДНА заявка, само броячи.
//
// ADMIN вижда своята фирма; MASTER — и автоматизмите (те са на ниво
// инсталация и нямат фирма). Имена, имейли и адреси тук няма: панелът казва
// „двама администратори са без втори фактор", а кои — показва „Utenti".

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant, filtroUtenti } from "@/lib/tenant";
import { configSmtp } from "@/lib/posta/messaggio";
import { configAi } from "@/lib/ai/config";
import { impostazioniAi } from "@/lib/ai/politica-db";
import { haPermesso } from "@/lib/roles";

/** Същият списък като dead-man метриката (`/api/metrics`). */
const AUTOMATISMI = [
  "scadenze",
  "contratti",
  "retention",
  "webhook",
  "notifiche",
] as const;

async function ultimiRun() {
  return Promise.all(
    AUTOMATISMI.map(async (nome) => {
      const [ultimo, ultimoOk] = await Promise.all([
        prisma.automatismoRun.findFirst({
          where: { nome },
          orderBy: { iniziatoAt: "desc" },
          select: {
            esito: true,
            iniziatoAt: true,
            terminatoAt: true,
            durataMs: true,
            errore: true,
          },
        }),
        prisma.automatismoRun.findFirst({
          where: { nome, esito: "OK" },
          orderBy: { iniziatoAt: "desc" },
          select: { terminatoAt: true },
        }),
      ]);
      return { nome, ultimo, ultimoOk: ultimoOk?.terminatoAt ?? null };
    }),
  );
}

export const GET = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const master = s.ruolo === "MASTER";
  const utenti = filtroUtenti(s);
  const adesso = new Date();
  const [
    totale,
    sospesi,
    bloccati,
    privilegiatiSenzaMfa,
    aiDisattivati,
    inAttesa,
    fallite,
    ai,
    automatismi,
  ] = await Promise.all([
    prisma.user.count({ where: utenti }),
    prisma.user.count({ where: { ...utenti, attivo: false } }),
    prisma.user.count({ where: { ...utenti, bloccatoFino: { gt: adesso } } }),
    prisma.user.count({
      where: {
        ...utenti,
        attivo: true,
        totpAttivo: false,
        ruolo: { in: ["MASTER", "ADMIN"] },
      },
    }),
    prisma.user.count({ where: { ...utenti, aiConsentita: false } }),
    prisma.notifica.count({
      where: { ...filtroTenant(s), stato: "IN_ATTESA" },
    }),
    prisma.notifica.count({ where: { ...filtroTenant(s), stato: "FALLITA" } }),
    impostazioniAi(),
    master ? ultimiRun() : Promise.resolve(null),
  ]);
  return ok({
    master,
    utenti: { totale, sospesi, bloccati, privilegiatiSenzaMfa, aiDisattivati },
    notifiche: { inAttesa, fallite, smtpConfigurato: configSmtp() !== null },
    ai: {
      attiva: ai.attiva,
      estraiAttiva: ai.estraiAttiva,
      testoAttiva: ai.testoAttiva,
      providerConfigurato: configAi().effettivo !== "off",
    },
    automatismi,
    // Същото правило като `richiedeAvvioManuale` — бутонът не лъже.
    avvioManuale:
      master || (s.tenantId === null && haPermesso(s.ruolo, "RESPONSABILE")),
  });
});
