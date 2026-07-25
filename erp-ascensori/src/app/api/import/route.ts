// Importazione massiva от CSV — ADMIN+ (операция с висок ефект, гл. Controlli).
// Клиентът праща разпарсени редове; тук всяка редица минава Zod валидация.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import { amministratori, condomini, impianti, articoli, dipendenti } from "@/lib/entities";
import type { CrudConfig } from "@/lib/crud";

const IMPORTABILI: Record<string, CrudConfig> = {
  amministratori,
  condomini,
  impianti,
  articoli_magazzino: articoli,
  dipendenti,
};

const schema = z.object({
  entita: z.string(),
  righe: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const { entita, righe } = await corpoValidato(req, schema);
  const cfg = IMPORTABILI[entita];
  if (!cfg) throw new ErroreHttp(400, `Entità non importabile: ${entita}`);

  let importate = 0;
  const errori: { riga: number; errore: string }[] = [];
  const d = (prisma as unknown as Record<string, { create(a: object): Promise<unknown> }>)[
    cfg.model
  ];

  for (let i = 0; i < righe.length; i++) {
    const parsed = cfg.schemaCreate.safeParse(righe[i]);
    if (!parsed.success) {
      errori.push({
        riga: i + 1,
        errore: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
      });
      continue;
    }
    try {
      await d.create({ data: parsed.data as object });
      importate++;
    } catch (e) {
      const codice = (e as { code?: string }).code;
      errori.push({
        riga: i + 1,
        errore: codice === "P2002" ? "duplicato su campo univoco" : "errore di scrittura",
      });
    }
  }

  await scriviAudit({
    azione: "IMPORT",
    entita,
    dettagli: { importate, errori: errori.length },
    utenteId: s.sub,
  });
  return ok({ importate, errori });
});
