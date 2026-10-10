import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { commitVerification } from '../services/sso/domains.js';
import { normalizeDomain } from '../services/sso/policy.js';

/**
 * Аварийно доказване на домейн БЕЗ DNS (на сървъра, от средата) — когато клиентът не може да добави
 * TXT запис, а собствеността е проверена по друг път (договор, писмо от домейна…). Иска изричния
 * флаг; всяко доказване е в одита (`sso.domain_verified`, via: cli, без актьор):
 *   TENANT_SLUG=alfa-spa SSO_DOMAIN=alfa.it SSO_VERIFY_WITHOUT_DNS=1 npm run sso:verify-domain
 *   … SSO_SCOPE=internal|<companyId> — ако домейнът е заявен от два доставчика в същия клиент
 * Домейн, вече доказан от друг доставчик, НЕ се отнема (първият доказал печели); недоказаните
 * заявки на другите се изтриват — като при DNS.
 */

const Env = z.object({
  TENANT_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  SSO_DOMAIN: z.string().trim().min(3).max(253),
  SSO_SCOPE: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(40).optional()),
  SSO_VERIFY_WITHOUT_DNS: z.literal('1', {
    error: 'SSO_VERIFY_WITHOUT_DNS=1 е задължителен: доказване без DNS е изрично решение',
  }),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  const domain = normalizeDomain(env.SSO_DOMAIN);
  if (!domain) throw new Error(`Невалиден домейн „${env.SSO_DOMAIN}“.`);
  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUnique({ where: { slug: env.TENANT_SLUG } });
    if (!tenant) throw new Error(`Няма клиент „${env.TENANT_SLUG}“.`);
    const claims = await db.ssoDomain.findMany({
      where: {
        tenantId: tenant.id,
        domain,
        ...(env.SSO_SCOPE ? { config: { scopeKey: env.SSO_SCOPE } } : {}),
      },
    });
    if (claims.length === 0) throw new Error(`Клиентът няма доставчик, заявил „${domain}“.`);
    if (claims.length > 1) {
      throw new Error('Домейнът е заявен от няколко доставчика в клиента — задайте SSO_SCOPE.');
    }
    const row = claims[0];
    if (!row) throw new Error('Няма заявка.');
    const result = await commitVerification(db, row, 'cli', null);
    if (result === 'taken') throw new Error(`„${domain}“ вече е доказан от друг доставчик.`);
    process.stdout.write(`Домейнът „${domain}“ е доказан (без DNS, в одита).\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
