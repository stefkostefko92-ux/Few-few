// Шаблонът на печатните документи — ADMIN+ (определя вида на всеки документ).
// Какво шаблонът може и какво НЕ може да промени: `src/lib/pdf/modello.ts`.

import { prisma } from "@/lib/prisma";
import { ok, errore, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { leggiModello, schemaModelloIngresso } from "@/lib/pdf/modello";

export const GET = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const d = await prisma.datiAzienda.findFirst({
    where: { tenantId: s.tenantId ?? null },
    select: { modelloDocumenti: true, logo: true },
  });
  return ok({
    modello: leggiModello(d?.modelloDocumenti ?? null),
    haLogo: Boolean(d?.logo),
    datiPresenti: Boolean(d),
  });
});

export const PUT = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const tenantId = s.tenantId ?? null;
  const ingresso = await corpoValidato(req, schemaModelloIngresso);
  const riga = await prisma.datiAzienda.findFirst({
    where: { tenantId },
    select: { id: true, modelloDocumenti: true },
  });
  if (!riga)
    return errore(
      409,
      "Compilare e salvare prima i dati aziendali, poi il modello dei documenti.",
    );
  // Нормализирано през четящата схема: фиксираното заглавие не се записва
  // различно от това, което документът ще отпечата.
  const modello = leggiModello(ingresso);
  await prisma.datiAzienda.update({
    where: { id: riga.id },
    data: { modelloDocumenti: modello },
  });
  const prima = leggiModello(riga.modelloDocumenti);
  // Одитът пази КОИ раздели са сменени, не текстовете (те може да носят
  // имена, условия, IBAN) — неизменимият регистър живее години.
  const cambiati = (Object.keys(modello) as (keyof typeof modello)[]).filter(
    (k) => JSON.stringify(prima[k]) !== JSON.stringify(modello[k]),
  );
  await scriviAudit({
    azione: "UPDATE",
    entita: "dati_azienda",
    entitaId: riga.id,
    dettagli: { campi: cambiati.map((k) => `modello.${k}`) },
    utenteId: s.sub,
    tenantId,
  });
  return ok({ modello });
});
