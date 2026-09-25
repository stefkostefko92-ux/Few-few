// ИИ асистентът за цялата инсталация — само MASTER.
//
// GET връща и състоянието на ДОСТАВЧИКА (конфигуриран ли е в средата), за да
// е ясно на екрана кое е решение на администратора и кое — липсваща настройка
// на сървъра. Ключът никога не излиза; излиза само етикетът на доставчика.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { dettagliModifica } from "@/lib/audit-dettagli";
import { configAi } from "@/lib/ai/config";
import { impostazioniAi } from "@/lib/ai/politica-db";
import { RUOLI } from "@/lib/roles";

const schema = z.object({
  attiva: z.boolean().optional(),
  estraiAttiva: z.boolean().optional(),
  testoAttiva: z.boolean().optional(),
  ruoliAmmessi: z.array(z.enum(RUOLI)).max(RUOLI.length).optional(),
});

async function stato() {
  const c = configAi();
  const [cfg, disattivati] = await Promise.all([
    impostazioniAi(),
    prisma.user.count({ where: { aiConsentita: false } }),
  ]);
  return {
    ...cfg,
    provider: {
      configurato: c.effettivo !== "off",
      etichetta: c.etichettaFornitore,
    },
    /** Колко акаунта са изключени поотделно — връзка към „Utenti". */
    accountDisattivati: disattivati,
  };
}

export const GET = gestito(async () => {
  await richiedeRuolo("MASTER");
  return ok(await stato());
});

export const PUT = gestito(async (req) => {
  const s = await richiedeRuolo("MASTER");
  const data = await corpoValidato(req, schema);
  const prima = await impostazioniAi();
  const dopo = { ...prima, ...data };
  if (data.ruoliAmmessi) dopo.ruoliAmmessi = [...new Set(data.ruoliAmmessi)];
  await prisma.configurazioneAi.upsert({
    where: { id: 1 },
    create: { id: 1, ...dopo, aggiornataDa: s.sub },
    update: { ...dopo, aggiornataDa: s.sub },
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "configurazione_ai",
    entitaId: s.sub,
    dettagli: dettagliModifica(prima, dopo),
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok(await stato());
});
