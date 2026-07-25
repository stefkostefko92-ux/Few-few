// Запис в неизменния регистър — при всяка операция, без възможност за изключване.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { firmaAudit } from "@/lib/audit-hmac";
import { ipClient } from "@/lib/ip-client";

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
  if (!k || k.length < 32)
    throw new Error("AUDIT_HMAC_KEY mancante o troppo corto (min 32)");
  return k;
}

// Минимален контракт за клиента (позволява подаване на транзакционен tx).
interface ClienteAudit {
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export async function scriviAudit(
  opts: {
    azione: AzioneAudit;
    entita: string;
    entitaId?: string | null;
    dettagli?: unknown;
    utenteId?: string | null;
    /** Фирмата, чиито данни е засегнала операцията. Подава се от сесията:
     *  без нея регистърът не може да се филтрира и администраторът на една
     *  фирма чете одита на друга. */
    tenantId?: string | null;
  },
  db: ClienteAudit = prisma,
): Promise<void> {
  const h = await headers();
  // Минимизация (GDPR чл. 5(1)(в)): IP и userAgent се пазят САМО при събитията
  // за сигурност (вход/изход). За „кой смени статуса на ордин 4711" мрежовият
  // адрес не добавя нищо, а превръща бизнес одита в дневник на присъствието.
  const eSicurezza = opts.azione === "LOGIN" || opts.azione === "LOGOUT";
  // Последният елемент е добавен от нашия единствен доверен proxy; водещите са
  // подадени от клиента и не бива да се вярват за rate-limit/одит ключ.
  const ip = eSicurezza ? ipClient(h) : null;
  const userAgent = eSicurezza ? h.get("user-agent") : null;
  const createdAt = new Date();
  const riga = {
    azione: opts.azione,
    entita: opts.entita,
    entitaId: opts.entitaId ?? null,
    dettagli: opts.dettagli ?? null,
    ip,
    userAgent: userAgent ?? null,
    utenteId: opts.utenteId ?? null,
    createdAt,
  };
  await db.auditLog.create({
    data: {
      ...riga,
      // НЕ влиза в подписа: tenantId е класификация за достъп, не съдържание на
      // операцията, и канонът вече е версиониран — промяна в него би обезсилила
      // всички досегашни подписи.
      tenantId: opts.tenantId ?? null,
      dettagli: riga.dettagli === null ? undefined : (riga.dettagli as object),
      hmac: firmaAudit(riga, chiaveAudit()),
    },
  });
}
