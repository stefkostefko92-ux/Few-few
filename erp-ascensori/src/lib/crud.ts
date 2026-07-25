// Generic CRUD фабрика: една конфигурация на entity → GET/POST + GET/PUT/DELETE.
// Всяка операция минава през проверка на ролята (на сървъра!) и пише в audit.

import type { ZodSchema } from "zod";
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
import type { Sessione as SessioneAttiva } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { paginazione, testoParam, booleanoParam, uuidParam } from "@/lib/query";

interface Delegate {
  findMany(args?: object): Promise<unknown[]>;
  count(args?: object): Promise<number>;
  findUnique(args: object): Promise<unknown | null>;
  findFirst(args: object): Promise<unknown | null>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
}

/** Ключовете на Prisma клиента, които са МОДЕЛИ (имат `findMany`), а не `$transaction`.
 *
 *  Без този тип `model` беше просто `string` и печатна грешка в конфигурацията
 *  („condomino" вместо „condominio") се откриваше чак по време на изпълнение —
 *  като 500 при първата заявка към маршрута. Сега е грешка при компилация. */
export type ModelloPrisma = {
  [K in keyof typeof prisma]: (typeof prisma)[K] extends { findMany: unknown }
    ? K
    : never;
}[keyof typeof prisma];

export interface CrudConfig {
  /** име на таблицата за audit (напр. "condomini") */
  entita: string;
  /** Prisma delegate (prisma.condominio и т.н.) */
  model: ModelloPrisma;
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
  /** полета от сесията, които се записват при създаване (напр. автор) */
  campiSessione?: (s: SessioneAttiva) => Record<string, unknown>;
  /** hook след запис (напр. преизчисляване на тотали) */
  afterWrite?: (id: string) => Promise<void>;
}

function delegate(model: ModelloPrisma): Delegate {
  return (prisma as unknown as Record<ModelloPrisma, Delegate>)[model];
}

function idRecord(r: unknown): string {
  return String((r as { id: string }).id);
}

/** GET (списък с търсене/страници) + POST (създаване). */
export function rottaCollezione(cfg: CrudConfig) {
  const GET = gestito(async (req) => {
    const s = await richiedeRuolo(cfg.ruoloLettura ?? "OPERATORE");
    const url = new URL(req.url);
    const q = testoParam(url);
    const attivo = booleanoParam(url, "attivo");
    const { page, size, skip, take } = paginazione(url);

    // Изолация по фирма ПЪРВО — не се презаписва от клиентски параметър.
    const where: Record<string, unknown> = cfg.senzaTenant
      ? {}
      : filtroTenant(s);
    if (q && cfg.searchFields?.length) {
      where.OR = cfg.searchFields.map((f) => ({
        [f]: { contains: q, mode: "insensitive" },
      }));
    }
    if (attivo !== undefined) where.attivo = attivo;
    for (const campo of cfg.filterFields ?? []) {
      const v = url.searchParams.get(campo);
      // Полетата с име на …Id са външни ключове: сгрешен UUID трябва да даде 400,
      // не 500 от базата.
      if (v) where[campo] = campo.endsWith("Id") ? uuidParam(url, campo) : v;
    }

    const d = delegate(cfg.model);
    const [righe, totale] = await Promise.all([
      d.findMany({
        where,
        include: cfg.include,
        orderBy: cfg.orderBy ?? { createdAt: "desc" },
        skip,
        take,
      }),
      d.count({ where }),
    ]);
    return ok({ righe, totale, page, size });
  });

  const POST = gestito(async (req) => {
    const s = await richiedeRuolo(cfg.ruoloScrittura ?? "OPERATORE");
    const data = await corpoValidato(req, cfg.schemaCreate);
    const creato = await delegate(cfg.model).create({
      data: {
        ...(data as object),
        ...(cfg.senzaTenant ? {} : tenantDiCreazione(s)),
        ...(cfg.campiSessione?.(s) ?? {}),
      },
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
      tenantId: s.tenantId,
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
    const dopo = await d.update({
      where: { id },
      data: data as object,
      include: cfg.include,
    });
    if (cfg.afterWrite) await cfg.afterWrite(id);
    await scriviAudit({
      azione: "UPDATE",
      entita: cfg.entita,
      entitaId: id,
      dettagli: dettagliModifica(prima, {
        ...(prima as object),
        ...(data as object),
      }),
      utenteId: s.sub,
      tenantId: s.tenantId,
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
      tenantId: s.tenantId,
    });
    return ok({ ok: true });
  });

  return { GET, PUT, DELETE };
}
