import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Изчистване по давност (GDPR чл. 5(1)(e) — ограничение на съхранението).
// Задържане по подразбиране (презаписва се през env):
//   AuditLog        — 365 дни (сигурност/отчетност; съдържа имейли)
//   HealthCheck     — 90 дни (оперативна телеметрия)
//   FormSubmission  — 365 дни (запитвания от контактни форми; имена/имейли)
// Пази се със същия таен токен като здравния cron.
//   curl -X POST -H "Authorization: Bearer ТАЙНА" https://.../api/cron/prune

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function days(envVar: string, fallback: number): number {
  const n = Number(process.env[envVar]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function POST(req: NextRequest) {
  const token = process.env.CRON_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "CRON_TOKEN не е зададен." }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json({ error: "Неоторизиран." }, { status: 401 });
  }

  const auditDays = days("AUDIT_RETENTION_DAYS", 365);
  const healthDays = days("HEALTH_RETENTION_DAYS", 90);
  const submissionDays = days("SUBMISSION_RETENTION_DAYS", 365);
  const auditBefore = new Date(Date.now() - auditDays * 86_400_000);
  const healthBefore = new Date(Date.now() - healthDays * 86_400_000);
  const submissionBefore = new Date(Date.now() - submissionDays * 86_400_000);

  const [audit, health, submissions] = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditBefore } } }),
    prisma.healthCheck.deleteMany({ where: { checkedAt: { lt: healthBefore } } }),
    prisma.formSubmission.deleteMany({ where: { createdAt: { lt: submissionBefore } } }),
  ]);

  await logAudit(null, {
    action: "DELETE",
    entity: "AuditLog",
    summary: `Изчистване по давност: ${audit.count} одит записа (>${auditDays}д), ${health.count} проверки (>${healthDays}д), ${submissions.count} заявки (>${submissionDays}д)`,
  });

  return NextResponse.json({
    prunedAuditLogs: audit.count,
    prunedHealthChecks: health.count,
    prunedSubmissions: submissions.count,
    auditRetentionDays: auditDays,
    healthRetentionDays: healthDays,
    submissionRetentionDays: submissionDays,
  });
}
