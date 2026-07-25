// Обща фабрика за редови подресурси (voci_preventivo / voci_fattura / righe_ddt).
// След всяка промяна се вика ricalcola() — тоталите никога на ръка.

import type { ZodSchema } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";

interface DelegateVoce {
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
  findUnique(args: object): Promise<unknown | null>;
}

export interface VociConfig {
  entita: string; // за audit
  model: string; // редовият модел
  parentModel: string; // родителският модел
  parentField: string; // FK поле към родителя
  schema: ZodSchema;
  ricalcola?: (parentId: string) => Promise<void>;
}

function delegate(model: string): DelegateVoce {
  return (prisma as unknown as Record<string, DelegateVoce>)[model];
}

async function controllaParent(cfg: VociConfig, parentId: string): Promise<void> {
  const p = await (
    prisma as unknown as Record<string, { findUnique(a: object): Promise<unknown | null> }>
  )[cfg.parentModel].findUnique({ where: { id: parentId } });
  if (!p) throw new ErroreHttp(404, "Documento non trovato");
}

/** POST /:id/voci — добавя редица. */
export function rottaVociCollezione(cfg: VociConfig) {
  const POST = gestito(async (req, ctx) => {
    const s = await richiedeRuolo("OPERATORE");
    const { id } = await ctx.params;
    await controllaParent(cfg, id);
    const data = await corpoValidato(req, cfg.schema);
    const creato = await delegate(cfg.model).create({
      data: { ...(data as object), [cfg.parentField]: id },
    });
    if (cfg.ricalcola) await cfg.ricalcola(id);
    await scriviAudit({
      azione: "CREATE",
      entita: cfg.entita,
      entitaId: String((creato as { id: string }).id),
      dettagli: { dopo: data },
      utenteId: s.sub,
    });
    return ok(creato, 201);
  });
  return { POST };
}

/** PUT/DELETE /:id/voci/:voceId. */
export function rottaVoceElemento(cfg: VociConfig) {
  const PUT = gestito(async (req, ctx) => {
    const s = await richiedeRuolo("OPERATORE");
    const { id, voceId } = await ctx.params;
    const d = delegate(cfg.model);
    const prima = (await d.findUnique({ where: { id: voceId } })) as Record<
      string,
      unknown
    > | null;
    if (!prima || prima[cfg.parentField] !== id)
      throw new ErroreHttp(404, "Riga non trovata");
    const data = await corpoValidato(req, cfg.schema);
    const dopo = await d.update({ where: { id: voceId }, data: data as object });
    if (cfg.ricalcola) await cfg.ricalcola(id);
    await scriviAudit({
      azione: "UPDATE",
      entita: cfg.entita,
      entitaId: voceId,
      dettagli: { prima, dopo: data },
      utenteId: s.sub,
    });
    return ok(dopo);
  });

  const DELETE = gestito(async (_req, ctx) => {
    const s = await richiedeRuolo("OPERATORE");
    const { id, voceId } = await ctx.params;
    const d = delegate(cfg.model);
    const prima = (await d.findUnique({ where: { id: voceId } })) as Record<
      string,
      unknown
    > | null;
    if (!prima || prima[cfg.parentField] !== id)
      throw new ErroreHttp(404, "Riga non trovata");
    await d.delete({ where: { id: voceId } });
    if (cfg.ricalcola) await cfg.ricalcola(id);
    await scriviAudit({
      azione: "DELETE",
      entita: cfg.entita,
      entitaId: voceId,
      dettagli: { prima },
      utenteId: s.sub,
    });
    return ok({ ok: true });
  });

  return { PUT, DELETE };
}
