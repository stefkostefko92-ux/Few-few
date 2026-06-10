import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const HMAC_SECRET = process.env.HMAC_SECRET || 'erp-ascensori-hmac-secret';

export async function createAuditLog(params: {
  azione: string;
  entita: string;
  entitaId?: string;
  dettagli?: any;
  utenteId?: string;
  ip?: string;
  userAgent?: string;
}) {
  const payload = JSON.stringify({
    azione: params.azione,
    entita: params.entita,
    entitaId: params.entitaId,
    dettagli: params.dettagli,
    utenteId: params.utenteId,
    timestamp: new Date().toISOString(),
  });

  const hmac = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex');

  return prisma.auditLog.create({
    data: {
      azione: params.azione,
      entita: params.entita,
      entitaId: params.entitaId,
      dettagli: params.dettagli,
      utenteId: params.utenteId,
      ip: params.ip,
      userAgent: params.userAgent,
      hmac,
    },
  });
}

export async function verifyAuditLog(logId: string): Promise<boolean> {
  const log = await prisma.auditLog.findUnique({ where: { id: logId } });
  if (!log) return false;

  const payload = JSON.stringify({
    azione: log.azione,
    entita: log.entita,
    entitaId: log.entitaId,
    dettagli: log.dettagli,
    utenteId: log.utenteId,
    timestamp: log.createdAt.toISOString(),
  });

  const expectedHmac = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex');

  return log.hmac === expectedHmac;
}
