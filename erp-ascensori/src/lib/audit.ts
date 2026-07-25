// Запис в неизменния регистър — при всяка операция, без възможност за изключване.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { firmaAudit } from "@/lib/audit-hmac";

export type AzioneAudit =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "STATE_CHANGE"
  | "IMPORT";

function chiaveAudit(): string {
  const k = process.env.AUDIT_HMAC_KEY;
  if (!k || k.length < 32) throw new Error("AUDIT_HMAC_KEY mancante o troppo corto (min 32)");
  return k;
}

export async function scriviAudit(opts: {
  azione: AzioneAudit;
  entita: string;
  entitaId?: string | null;
  dettagli?: unknown;
  utenteId?: string | null;
}): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  const createdAt = new Date();
  const riga = {
    azione: opts.azione,
    entita: opts.entita,
    entitaId: opts.entitaId ?? null,
    dettagli: opts.dettagli ?? null,
    utenteId: opts.utenteId ?? null,
    createdAt,
  };
  await prisma.auditLog.create({
    data: {
      ...riga,
      dettagli: riga.dettagli === null ? undefined : (riga.dettagli as object),
      ip,
      userAgent,
      hmac: firmaAudit(riga, chiaveAudit()),
    },
  });
}
