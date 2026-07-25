// Проверка на целостта: преподписва редовете, сравнява HMAC и проверява
// ВЕРИГАТА. Несъвпадение = доказуема директна манипулация в базата.
//
// Три различни неща се откриват тук, и си струва да се различават:
//   • променен ред → собственият му подпис не съвпада;
//   • ИЗТРИТ ред   → веригата се къса при следващия (дотогава невидимо);
//   • стар ключ    → редът е валиден, но подписан с предишния AUDIT_HMAC_KEY.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, errore, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { verificaConRotazione, type VersioneFirma } from "@/lib/audit-hmac";
import { chiaveAudit, chiaveAuditPrecedente } from "@/lib/audit";

const schema = z.object({
  /** брой последни редове за проверка (по подразбиране 500) */
  limite: z.number().int().min(1).max(10000).optional(),
});

export const POST = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const { limite = 500 } = await corpoValidato(req, schema);

  let chiave: string;
  try {
    chiave = chiaveAudit();
  } catch {
    return errore(
      500,
      "Chiave di verifica non configurata: contattare l'amministratore di sistema",
    );
  }
  const precedente = chiaveAuditPrecedente();

  // Взимаме последните `limite`, но ги обхождаме ВЪЗХОДЯЩО: веригата се
  // проверява в реда, в който е изградена. Подредбата е по `seq`, не по
  // `createdAt` — две вписвания в една милисекунда се сортират произволно.
  //
  // Прочистването по срок (`retention-runner.ts`) е ЕДИНСТВЕНИЯТ законен начин
  // редове да напуснат регистъра и оставя истинско прекъсване по средата:
  // следата за пуска стои в `automatismi_run`, с която операторът обяснява
  // всяко очаквано прекъсване.
  const ultime = await prisma.auditLog.findMany({
    where: s.ruolo === "MASTER" ? {} : filtroTenant(s),
    orderBy: { seq: "desc" },
    take: limite,
  });
  const righe = [...ultime].reverse();

  const corrotte: string[] = [];
  const catenaRotta: string[] = [];
  const conChiaveVecchia: string[] = [];

  // Веригата е ПО ФИРМА, а MASTER вижда всички наведнъж: с един общ показалец
  // редовете на две фирми се преплитат и всяко звено би изглеждало счупено.
  const ultimoPerTenant = new Map<string, string>();

  for (const r of righe) {
    const chiaveTenant = r.tenantId ?? "";
    const versione = (r.versioneFirma === 1 ? 1 : r.versioneFirma === 2 ? 2 : 3) as VersioneFirma;
    const esito = verificaConRotazione(
      {
        azione: r.azione,
        entita: r.entita,
        entitaId: r.entitaId,
        dettagli: r.dettagli ?? null,
        ip: r.ip,
        userAgent: r.userAgent,
        utenteId: r.utenteId,
        createdAt: r.createdAt,
        hmacPrecedente: r.hmacPrecedente,
      },
      r.hmac,
      { corrente: chiave, precedente },
      versione,
    );

    if (!esito.valida) corrotte.push(r.id);
    else if (esito.conChiavePrecedente) conChiaveVecchia.push(r.id);

    // Веригата важи от версия 3. Първият ред на всяка фирма в извадката се
    // пропуска: предходникът му може просто да е извън `limite`.
    const atteso = ultimoPerTenant.get(chiaveTenant);
    if (versione >= 3 && atteso !== undefined && r.hmacPrecedente !== atteso)
      catenaRotta.push(r.id);

    ultimoPerTenant.set(chiaveTenant, r.hmac);
  }

  return ok({
    controllate: righe.length,
    corrotte,
    catenaRotta,
    conChiaveVecchia,
    integro: corrotte.length === 0 && catenaRotta.length === 0,
  });
});
