import type { SsoConfig, SsoDomain } from '@prisma/client';
import { txtRecord } from './domains.js';

/**
 * Изгледът на доставчик за конзолата: без секрета (само `hasSecret`), домейните със статуса на
 * доказването — за недоказан и DNS записът, който администраторът да добави (токенът не е тайна:
 * така или иначе отива в публичния DNS; извежда се, не се пази).
 */

type DomainRow = Pick<SsoDomain, 'configId' | 'domain' | 'tokenNonce' | 'verifiedAt'>;

export function configView(
  cfg: SsoConfig & {
    domains: DomainRow[];
    company: { name: string } | null;
    _count: { identities: number };
  },
  pepper: string,
) {
  const domains = [...cfg.domains].sort((a, b) => a.domain.localeCompare(b.domain));
  return {
    id: cfg.id,
    companyId: cfg.companyId,
    companyName: cfg.company?.name ?? null,
    provider: cfg.provider,
    displayName: cfg.displayName,
    issuer: cfg.issuer,
    entraTenantId: cfg.entraTenantId,
    clientId: cfg.clientId,
    /** Само че го има и кога е сменен — стойността никога не излиза. */
    hasSecret: cfg.clientSecretEnc.length > 0,
    secretUpdatedAt: cfg.secretUpdatedAt,
    mode: cfg.mode,
    trustIdpMfa: cfg.trustIdpMfa,
    idpLogout: cfg.idpLogout,
    enabled: cfg.enabled,
    lastTestAt: cfg.lastTestAt,
    lastTestOk: cfg.lastTestOk,
    lastTestReport: cfg.lastTestReport,
    domains: domains.map((d) => d.domain),
    domainStatus: domains.map((d) => ({
      domain: d.domain,
      verifiedAt: d.verifiedAt,
      txt: d.verifiedAt ? null : txtRecord(pepper, d),
    })),
    linkedUsers: cfg._count.identities,
  };
}

export const CONFIG_INCLUDE = {
  domains: { select: { configId: true, domain: true, tokenNonce: true, verifiedAt: true } },
  company: { select: { name: true } },
  _count: { select: { identities: true } },
} as const;
