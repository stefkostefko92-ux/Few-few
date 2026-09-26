// Абонаменти за събития.
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ok, gestito, corpoValidato } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { EVENTI } from "@/lib/webhook/firma";
import { nomeHostSospetto } from "@/lib/rete";

const schema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), "L'indirizzo deve essere HTTPS"),
  eventi: z.array(z.enum(EVENTI)).min(1, "Selezionare almeno un evento"),
});

/**
 * Известието носи бизнес данни — адресът трябва да е ВЪН, не към нас самите.
 *
 * Тази проверка е само УДОБСТВО: тя връща грешка веднага, докато човекът е още
 * на формата, вместо мълчаливо провалени доставки часове по-късно. Истинската
 * защита срещу SSRF е при СВЪРЗВАНЕТО (`lookupSicuro` в `lib/rete.ts`), защото
 * име, проверено днес, утре може да сочи навътре.
 */
function indirizzoAmmesso(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return !nomeHostSospetto(u.hostname);
}

export const GET = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const righe = await prisma.webhook.findMany({
    where: filtroTenant(s),
    // Тайната НЕ излиза след създаването: с нея се подправят известия.
    select: {
      id: true,
      url: true,
      eventi: true,
      attivo: true,
      fallimenti: true,
      createdAt: true,
      _count: { select: { consegne: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ righe, eventiDisponibili: EVENTI });
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const dati = await corpoValidato(req, schema);
  if (!indirizzoAmmesso(dati.url))
    throw new ErroreHttp(
      400,
      "Indirizzo non ammesso: deve essere pubblico e raggiungibile",
    );

  const segreto = randomBytes(32).toString("base64url");
  const creato = await prisma.webhook.create({
    data: {
      url: dati.url,
      eventi: dati.eventi,
      segreto,
      ...tenantDiCreazione(s),
    },
    select: { id: true, url: true, eventi: true, attivo: true },
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "webhooks",
    entitaId: creato.id,
    dettagli: { url: dati.url, eventi: dati.eventi },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok(
    { ...creato, segreto, avviso: "Copiare ora: non sarà più visibile." },
    201,
  );
});
