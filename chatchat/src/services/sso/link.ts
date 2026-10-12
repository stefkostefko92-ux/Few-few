import { Prisma, type PrismaClient, type SsoConfig } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import {
  announceRevocation,
  revokeUserSessions,
  type SessionRevocation,
} from '../../auth/sessions.js';
import { readExternalLogin } from './claims.js';
import type { FlowResult } from './flow.js';
import { covers, domainVerifiedFor } from './policy.js';

/**
 * Свързване от собственика („Свържи с Microsoft/доставчика“): единственият път за акаунт, който НЕ
 * се свързва по имейл при вход (администраторът на клиента, всеки с включен локален TOTP).
 * Започва се от сесия с парола + минат локален TOTP (`routes/auth-sso-link.ts`); връщането от
 * доставчика носи бисквитката на потока (същият браузър), а записът на потока — сесията, от която е
 * започнато: тя трябва да е още жива, на същия човек, с парола и минат TOTP. Идентичността трябва да
 * носи проверен имейл в ДОКАЗАН домейн на доставчика, равен на имейла на акаунта (tid/oid/гост — в
 * `readExternalLogin`). Чужда идентичност (вече свързана с друг акаунт) не се отнема.
 */

export type LinkOutcome = 'ok' | 'failed' | 'denied';

export type LinkFailure =
  'session' | 'user' | 'claims' | 'email_mismatch' | 'domain_not_allowed' | 'link_conflict';

export interface LinkResult {
  outcome: LinkOutcome;
  /** Само в одита (кодове). */
  reason: string | null;
}

async function liveOwnerSession(db: PrismaClient, sessionId: string | null, userId: string | null) {
  if (!sessionId || !userId) return null;
  const s = await db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  const now = new Date();
  if (
    !s ||
    s.userId !== userId ||
    s.revokedAt !== null ||
    s.expiresAt <= now ||
    s.authMethod !== 'PASSWORD' ||
    !s.mfaPassed
  ) {
    return null;
  }
  return s;
}

async function deny(
  db: PrismaClient,
  cfg: SsoConfig,
  actorId: string | null,
  reason: LinkFailure,
): Promise<LinkResult> {
  await appendAudit(db, {
    tenantId: cfg.tenantId,
    actorId,
    action: 'sso.link_failed',
    objectType: 'sso_config',
    objectId: cfg.id,
    detail: { reason },
  });
  return { outcome: 'denied', reason };
}

/** Връзката е на друг акаунт — не се отнема тихо. */
class LinkConflict extends Error {}

export async function finishLink(
  db: PrismaClient,
  r: FlowResult & { purpose: 'link' },
): Promise<LinkResult> {
  if (!r.ok) {
    if (r.config) {
      await appendAudit(db, {
        tenantId: r.config.tenantId,
        actorId: r.actorId,
        action: 'sso.link_failed',
        objectType: 'sso_config',
        objectId: r.config.id,
        detail: { reason: r.reason },
      });
    }
    return { outcome: 'failed', reason: r.reason };
  }
  const cfg = r.config;
  const session = await liveOwnerSession(db, r.sessionId, r.actorId);
  if (!session) return deny(db, cfg, r.actorId, 'session');
  const user = session.user;
  const now = new Date();
  if (
    user.tenantId !== cfg.tenantId ||
    user.role === 'PLATFORM_ADMIN' ||
    !covers(cfg, user) ||
    !user.active ||
    (user.expiresAt !== null && user.expiresAt <= now) ||
    user.totpEnabledAt === null
  ) {
    return deny(db, cfg, user.id, 'user');
  }
  const read = readExternalLogin(cfg, r.claims);
  if (!read.ok) return deny(db, cfg, user.id, 'claims');
  const login = read.login;
  if (!login.email || login.email !== user.email.toLowerCase()) {
    return deny(db, cfg, user.id, 'email_mismatch');
  }
  if (!(await domainVerifiedFor(db, cfg.id, login.email))) {
    return deny(db, cfg, user.id, 'domain_not_allowed');
  }

  let revocation: SessionRevocation | null = null;
  try {
    revocation = await db.$transaction(async (tx) => {
      const other = await tx.externalIdentity.findUnique({
        where: {
          issuer_externalSubject: { issuer: login.issuer, externalSubject: login.subject },
        },
        select: { userId: true },
      });
      if (other && other.userId !== user.id) throw new LinkConflict();
      const previous = await tx.externalIdentity.findUnique({ where: { userId: user.id } });
      const replaced =
        previous !== null &&
        (previous.issuer !== login.issuer || previous.externalSubject !== login.subject);
      if (previous) await tx.externalIdentity.delete({ where: { id: previous.id } });
      await tx.externalIdentity.create({
        data: {
          tenantId: cfg.tenantId,
          userId: user.id,
          configId: cfg.id,
          issuer: login.issuer,
          externalSubject: login.subject,
          linkMethod: 'SELF',
        },
      });
      await appendAudit(tx, {
        tenantId: cfg.tenantId,
        actorId: user.id,
        action: 'sso.identity_linked',
        objectType: 'user',
        objectId: user.id,
        detail: { configId: cfg.id, method: 'self', replaced },
      });
      // Заменена чужда връзка (сесиите от нея) или сесия само за свързване (REQUIRED: следващият
      // вход е през доставчика) → всички сесии на човека падат.
      return replaced || session.ssoLinkOnly
        ? revokeUserSessions(tx, [user.id], 'sso_changed')
        : null;
    });
  } catch (err) {
    if (err instanceof LinkConflict) return deny(db, cfg, user.id, 'link_conflict');
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return deny(db, cfg, user.id, 'link_conflict');
    }
    throw err;
  }
  if (revocation) await announceRevocation(revocation);
  return { outcome: 'ok', reason: null };
}
