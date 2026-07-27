// Запис в неизменния регистър — при всяка операция, без възможност за изключване.
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { firmaAudit, VERSIONE_CORRENTE } from "@/lib/audit-hmac";
import { ipClient } from "@/lib/ip-client";

export type AzioneAudit =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "STATE_CHANGE"
  | "IMPORT";

export function chiaveAudit(): string {
  const k = process.env.AUDIT_HMAC_KEY;
  if (!k || k.length < 32)
    throw new Error("AUDIT_HMAC_KEY mancante o troppo corto (min 32)");
  return k;
}

/** Предишният ключ — само за ПРОВЕРКА, никога за подписване. */
export function chiaveAuditPrecedente(): string | null {
  const k = process.env.AUDIT_HMAC_KEY_PRECEDENTE;
  return k && k.length >= 32 ? k : null;
}

type ClienteAudit = Prisma.TransactionClient;

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
  /** Транзакцията на извикващия. Критичните операции (STATE_CHANGE) подават
   *  своята, за да се отмени преходът, ако одитът не се запише. */
  db?: ClienteAudit,
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
  const riga = {
    azione: opts.azione,
    entita: opts.entita,
    entitaId: opts.entitaId ?? null,
    dettagli: opts.dettagli ?? null,
    ip,
    userAgent: userAgent ?? null,
    utenteId: opts.utenteId ?? null,
    createdAt: new Date(),
  };
  const tenantId = opts.tenantId ?? null;

  const appendi = async (tx: ClienteAudit) => {
    // Веригата иска СЕРИАЛИЗИРАНО добавяне: „прочети последния → подпиши →
    // впиши" е класическо състезание. Две едновременни операции иначе получават
    // един и същ предходник, и проверката вижда счупена верига там, където
    // нищо не е пипано. Ключалката е за целия живот на транзакцията и е ПО
    // ФИРМА — вписването при един клиент не чака вписването при друг.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId ?? ""}, 0))`;

    // Условието по tenant е СЪЩЕСТВЕНО: една обща верига за всички фирми би
    // означавала, че прочистването по срок в едната чупи веригата на другата.
    const ultimo = await tx.auditLog.findFirst({
      where: { tenantId },
      orderBy: { seq: "desc" },
      select: { hmac: true },
    });
    const rigaFirmata = { ...riga, hmacPrecedente: ultimo?.hmac ?? null };

    await tx.auditLog.create({
      data: {
        ...riga,
        hmacPrecedente: rigaFirmata.hmacPrecedente,
        versioneFirma: VERSIONE_CORRENTE,
        // НЕ влиза в подписа: tenantId е класификация за достъп, не съдържание на
        // операцията, и канонът вече е версиониран — промяна в него би обезсилила
        // всички досегашни подписи.
        tenantId,
        dettagli:
          riga.dettagli === null ? undefined : (riga.dettagli as object),
        hmac: firmaAudit(rigaFirmata, chiaveAudit()),
      },
    });
  };

  // Без чужда транзакция си отваряме СВОЯ: `pg_advisory_xact_lock` извън
  // транзакция се освобождава веднага и ключалката не пази нищо.
  if (db) return appendi(db);
  await prisma.$transaction(appendi);
}
