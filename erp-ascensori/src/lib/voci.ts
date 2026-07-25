// Обща фабрика за редови подресурси (voci_preventivo / voci_fattura / righe_ddt).
// След всяка промяна се вика ricalcola() — тоталите никога на ръка.

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
import type { ModelloPrisma } from "@/lib/crud";
import type { ClientePrisma } from "@/lib/totali-db";
import type { Sessione } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";

/** Минималният контракт, който `controllaParent` иска от родителския модел. */
interface ContoParent {
  updateMany(a: object): Promise<{ count: number }>;
  findFirst(a: object): Promise<unknown | null>;
}

interface DelegateVoce {
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
  findUnique(args: object): Promise<unknown | null>;
}

export interface VociConfig {
  entita: string; // за audit
  model: ModelloPrisma; // редовият модел
  parentModel: ModelloPrisma; // родителският модел
  parentField: string; // FK поле към родителя
  schema: ZodSchema;
  /** Преизчисление; приема транзакционен клиент, за да върви заедно с промяната. */
  ricalcola?: (parentId: string, db?: ClientePrisma) => Promise<void>;
  /** минимална роля за писане (по подразбиране OPERATORE); фактурите искат DIREZIONE */
  ruolo?: Ruolo;
  /** състояния на родителя, в които редовете са променими (напр. само BOZZA) */
  statiModificabili?: readonly string[];
}

function delegate(model: ModelloPrisma): DelegateVoce {
  return (prisma as unknown as Record<ModelloPrisma, DelegateVoce>)[model];
}

/** Същият delegate, но върху транзакционен клиент. */
function delegateTx(tx: ClientePrisma, model: ModelloPrisma): DelegateVoce {
  return (tx as unknown as Record<ModelloPrisma, DelegateVoce>)[model];
}

/**
 * Пази ДВА инварианта наведнъж — затова е една функция, викана от всеки маршрут:
 *   1. документът е на СВОЯТА фирма (иначе редовите подресурси заобикалят
 *      изолацията, която CRUD фабриката пази — познат UUID стигаше, за да се
 *      добави ред към чужда оферта);
 *   2. документът е в състояние, което приема промени по редовете.
 * `findFirst`, не `findUnique`: вторият не приема допълнително условие.
 *
 * Викa се ВЪТРЕ в транзакцията на промяната. Проверката отвън беше TOCTOU:
 * между четенето на статуса и вписването на реда друга заявка успяваше да
 * издаде документа, и редът влизаше в вече издадена фактура.
 */
async function controllaParent(
  tx: ClientePrisma,
  cfg: VociConfig,
  parentId: string,
  s: Sessione,
): Promise<void> {
  const d = (tx as unknown as Record<ModelloPrisma, ContoParent>)[cfg.parentModel];
  // Условен запис вместо четене: `updateMany` с условие по статус или сработва,
  // или връща 0 — и в двата случая под ключалката на реда, така че конкурентна
  // смяна на статуса не може да се промъкне между проверката и вписването.
  const esito = await d.updateMany({
    where: {
      id: parentId,
      ...filtroTenant(s),
      ...(cfg.statiModificabili ? { stato: { in: cfg.statiModificabili } } : {}),
    },
    data: { updatedAt: new Date() },
  });
  if (esito.count === 1) return;
  // Нула засегнати редове: или документът не е наш/не съществува, или е в
  // състояние, което не приема промени. Различаваме ги, за да не даваме 409 за
  // чужд документ (това би издало съществуването му).
  const esiste = await d.findFirst({ where: { id: parentId, ...filtroTenant(s) } });
  if (!esiste) throw new ErroreHttp(404, "Documento non trovato");
  throw new ErroreHttp(409, "Documento non modificabile in questo stato");
}

/** POST /:id/voci — добавя редица. */
export function rottaVociCollezione(cfg: VociConfig) {
  const POST = gestito(async (req, ctx) => {
    const s = await richiedeRuolo(cfg.ruolo ?? "OPERATORE");
    const { id } = await ctx.params;
    const data = await corpoValidato(req, cfg.schema);
    // Записът и преизчислението вървят ЗАЕДНО: иначе при провал на ricalcola
    // редът остава в базата, тоталите не го включват и одит не се пише —
    // документ с невидим ред без следа.
    const creato = await prisma.$transaction(async (tx) => {
      await controllaParent(tx, cfg, id, s);
      const r = await delegateTx(tx, cfg.model).create({
        data: { ...(data as object), [cfg.parentField]: id },
      });
      if (cfg.ricalcola) await cfg.ricalcola(id, tx);
      return r;
    });
    await scriviAudit({
      azione: "CREATE",
      entita: cfg.entita,
      entitaId: String((creato as { id: string }).id),
      dettagli: dettagliCreazione(data),
      utenteId: s.sub,
      tenantId: s.tenantId,
    });
    return ok(creato, 201);
  });
  return { POST };
}

/** PUT/DELETE /:id/voci/:voceId. */
export function rottaVoceElemento(cfg: VociConfig) {
  const PUT = gestito(async (req, ctx) => {
    const s = await richiedeRuolo(cfg.ruolo ?? "OPERATORE");
    const { id, voceId } = await ctx.params;
    const data = await corpoValidato(req, cfg.schema);
    const d = delegate(cfg.model);
    const prima = (await d.findUnique({ where: { id: voceId } })) as Record<
      string,
      unknown
    > | null;
    if (!prima || prima[cfg.parentField] !== id)
      throw new ErroreHttp(404, "Riga non trovata");
    const dopo = await prisma.$transaction(async (tx) => {
      await controllaParent(tx, cfg, id, s);
      const r = await delegateTx(tx, cfg.model).update({
        where: { id: voceId },
        data: data as object,
      });
      if (cfg.ricalcola) await cfg.ricalcola(id, tx);
      return r;
    });
    await scriviAudit({
      azione: "UPDATE",
      entita: cfg.entita,
      entitaId: voceId,
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
    const s = await richiedeRuolo(cfg.ruolo ?? "OPERATORE");
    const { id, voceId } = await ctx.params;
    const d = delegate(cfg.model);
    const prima = (await d.findUnique({ where: { id: voceId } })) as Record<
      string,
      unknown
    > | null;
    if (!prima || prima[cfg.parentField] !== id)
      throw new ErroreHttp(404, "Riga non trovata");
    await prisma.$transaction(async (tx) => {
      await controllaParent(tx, cfg, id, s);
      await delegateTx(tx, cfg.model).delete({ where: { id: voceId } });
      if (cfg.ricalcola) await cfg.ricalcola(id, tx);
    });
    await scriviAudit({
      azione: "DELETE",
      entita: cfg.entita,
      entitaId: voceId,
      dettagli: dettagliCancellazione(prima),
      utenteId: s.sub,
      tenantId: s.tenantId,
    });
    return ok({ ok: true });
  });

  return { PUT, DELETE };
}
