// Generic CRUD фабрика: една конфигурация на entity → GET/POST + GET/PUT/DELETE.
// Всяка операция минава през проверка на ролята (на сървъра!) и пише в audit.

import type { ZodSchema } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import {
  dettagliCreazione,
  dettagliModifica,
  dettagliCancellazione,
} from "@/lib/audit-dettagli";
import type { Ruolo } from "@/lib/roles";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";

interface Delegate {
  findMany(args?: object): Promise<unknown[]>;
  count(args?: object): Promise<number>;
  findUnique(args: object): Promise<unknown | null>;
  findFirst(args: object): Promise<unknown | null>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
}

export interface CrudConfig {
  /** име на таблицата за audit (напр. "condomini") */
  entita: string;
  /** Prisma delegate (prisma.condominio и т.н.) */
  model: string;
  schemaCreate: ZodSchema;
  schemaUpdate: ZodSchema;
  ruoloLettura?: Ruolo; // по подразбиране OPERATORE
  ruoloScrittura?: Ruolo; // по подразбиране OPERATORE
  ruoloCancellazione?: Ruolo; // по подразбиране RESPONSABILE
  include?: object;
  orderBy?: object;
  /** текстови полета за търсене с ?q= */
  searchFields?: string[];
  /** полета, по които списъкът може да се филтрира от СЪРВЪРА (?поле=стойност).
   *  Без тях клиентът е принуден да дърпа всичко и да филтрира сам — което тихо
   *  губи данни над лимита на страницата. */
  filterFields?: string[];
  /** Моделът НЯМА tenantId (напр. tenants сам, служебни таблици). */
  senzaTenant?: boolean;
  /** hook след запис (напр. преизчисляване на тотали) */
  afterWrite?: (id: string) => Promise<void>;
}

function delegate(model: string): Delegate {
  const d = (prisma as unknown as Record<string, Delegate>)[model];
  if (!d) throw new Error(`Modello sconosciuto: ${model}`);
  return d;
}

function idRecord(r: unknown): string {
  return String((r as { id: string }).id);
}

/** GET (списък с търсене/страници) + POST (създаване). */
export function rottaCollezione(cfg: CrudConfig) {
  const GET = gestito(async (req) => {
    const s = await richiedeRuolo(cfg.ruoloLettura ?? "OPERATORE");
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const attivo = url.searchParams.get("attivo");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50) || 50));

    // Изолация по фирма ПЪРВО — не се презаписва от клиентски параметър.
    const where: Record<string, unknown> = cfg.senzaTenant ? {} : filtroTenant(s);
    if (q && cfg.searchFields?.length) {
      where.OR = cfg.searchFields.map((f) => ({
        [f]: { contains: q, mode: "insensitive" },
      }));
    }
    if (attivo === "true") where.attivo = true;
    if (attivo === "false") where.attivo = false;
    for (const campo of cfg.filterFields ?? []) {
      const v = url.searchParams.get(campo);
      if (v) where[campo] = v;
    }

    const d = delegate(cfg.model);
    const [righe, totale] = await Promise.all([
      d.findMany({
        where,
        include: cfg.include,
        orderBy: cfg.orderBy ?? { createdAt: "desc" },
        skip: (page - 1) * size,
        take: size,
      }),
      d.count({ where }),
    ]);
    return ok({ righe, totale, page, size });
  });

  const POST = gestito(async (req) => {
    const s = await richiedeRuolo(cfg.ruoloScrittura ?? "OPERATORE");
    const data = await corpoValidato(req, cfg.schemaCreate);
    const creato = await delegate(cfg.model).create({
      data: cfg.senzaTenant
        ? (data as object)
        : { ...(data as object), ...tenantDiCreazione(s) },
      include: cfg.include,
    });
    const id = idRecord(creato);
    if (cfg.afterWrite) await cfg.afterWrite(id);
    await scriviAudit({
      azione: "CREATE",
      entita: cfg.entita,
      entitaId: id,
      dettagli: dettagliCreazione(data),
      utenteId: s.sub,
    });
    return ok(creato, 201);
  });

  return { GET, POST };
}

/** GET/PUT/DELETE по /:id. */
export function rottaElemento(cfg: CrudConfig) {
  const GET = gestito(async (_req, ctx) => {
    const s = await richiedeRuolo(cfg.ruoloLettura ?? "OPERATORE");
    const { id } = await ctx.params;
    const r = await delegate(cfg.model).findFirst({
      where: cfg.senzaTenant ? { id } : { id, ...filtroTenant(s) },
      include: cfg.include,
    });
    if (!r) throw new ErroreHttp(404, "Record non trovato");
    return ok(r);
  });

  const PUT = gestito(async (req, ctx) => {
    const s = await richiedeRuolo(cfg.ruoloScrittura ?? "OPERATORE");
    const { id } = await ctx.params;
    const data = await corpoValidato(req, cfg.schemaUpdate);
    const d = delegate(cfg.model);
    const prima = await d.findFirst({
      where: cfg.senzaTenant ? { id } : { id, ...filtroTenant(s) },
    });
    if (!prima) throw new ErroreHttp(404, "Record non trovato");
    const dopo = await d.update({ where: { id }, data: data as object, include: cfg.include });
    if (cfg.afterWrite) await cfg.afterWrite(id);
    await scriviAudit({
      azione: "UPDATE",
      entita: cfg.entita,
      entitaId: id,
      dettagli: dettagliModifica(prima, { ...(prima as object), ...(data as object) }),
      utenteId: s.sub,
    });
    return ok(dopo);
  });

  const DELETE = gestito(async (_req, ctx) => {
    const s = await richiedeRuolo(cfg.ruoloCancellazione ?? "RESPONSABILE");
    const { id } = await ctx.params;
    const d = delegate(cfg.model);
    const prima = await d.findFirst({
      where: cfg.senzaTenant ? { id } : { id, ...filtroTenant(s) },
    });
    if (!prima) throw new ErroreHttp(404, "Record non trovato");
    // Референцирани от документи записи ги пази самата база (FK) → 409 в gestito()
    await d.delete({ where: { id } });
    await scriviAudit({
      azione: "DELETE",
      entita: cfg.entita,
      entitaId: id,
      dettagli: dettagliCancellazione(prima),
      utenteId: s.sub,
    });
    return ok({ ok: true });
  });

  return { GET, PUT, DELETE };
}

export type { NextResponse };
