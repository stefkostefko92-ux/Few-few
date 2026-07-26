// Фискалната самоличност на издаващата фирма — един запис на инсталация.
//
// Не минава през CRUD фабриката, защото не е списък: това е singleton по
// фирма. `upsert` по `tenantId`, за да е безразлично дали редът вече съществува.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica } from "@/lib/audit-dettagli";

const str = (max = 200) => z.string().trim().max(max).nullish();

const schema = z.object({
  ragioneSociale: z.string().trim().min(1).max(200),
  partitaIva: str(20),
  codiceFiscale: str(20),
  indirizzo: str(300),
  cap: str(10),
  citta: str(100),
  provincia: str(4),
  telefono: str(50),
  email: str(200),
  pec: str(200),
  codiceSdi: str(10),
  // Данъчният режим е задължителен реквизит на `CedentePrestatore` в XML-а за
  // SDI: без него документът се отхвърля още на входа.
  regimeFiscale: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^RF\d{2}$/, "Regime fiscale non valido (es. RF01)")
    .optional(),
  iban: str(40),
  rea: str(50),
  capitaleSociale: str(50),
  notePiePagina: str(500),
});

export const GET = gestito(async () => {
  // Всеки вижда данните: те са на самите документи, които и без това чете.
  const s = await richiedeRuolo("OPERATORE");
  const d = await prisma.datiAzienda.findFirst({
    where: { tenantId: s.tenantId ?? null },
  });
  return ok(d ?? {});
});

export const PUT = gestito(async (req) => {
  // Данните определят как изглежда всеки издаден документ → ADMIN+.
  const s = await richiedeRuolo("ADMIN");
  const data = await corpoValidato(req, schema);
  const tenantId = s.tenantId ?? null;

  const prima = await prisma.datiAzienda.findFirst({ where: { tenantId } });
  const dopo = prima
    ? await prisma.datiAzienda.update({ where: { id: prima.id }, data })
    : await prisma.datiAzienda.create({ data: { ...data, tenantId } });

  await scriviAudit({
    azione: "UPDATE",
    entita: "dati_azienda",
    entitaId: dopo.id,
    dettagli: prima
      ? dettagliModifica(prima, { ...prima, ...data })
      : { creazione: true },
    utenteId: s.sub,
    tenantId,
  });
  return ok(dopo);
});
