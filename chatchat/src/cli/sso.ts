import { z } from 'zod';
import { appendAudit } from '../audit.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { ssoSessionUsers } from '../services/sso/admin-store.js';
import { systemClientFromEnv } from '../db/clients.js';

/**
 * Аварийният изход от единния вход (на сървъра, от средата) — когато доставчикът е недостъпен или
 * сгрешен, а режимът е REQUIRED (паролата е отказана):
 *   TENANT_SLUG=alfa-spa npm run sso:off           — всички доставчици на клиента → OPTIONAL
 *   TENANT_SLUG=alfa-spa SSO_DISABLE=1 npm run sso:off — и ги изключва (входът става само с парола),
 *                                                     а SSO сесиите им се отнемат (компрометиран доставчик)
 * Нищо не трие (доставчиците и връзките остават); всяка промяна — в одита. Паролата на човек без
 * парола — `npm run user:reset` (еднократен линк).
 */

const Env = z.object({
  TENANT_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  SSO_DISABLE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['0', '1']).optional()),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  // Системната роля (chatchat_system, BYPASSRLS): CLI-то обикаля клиенти или създава клиент.
  const db = systemClientFromEnv();
  try {
    const tenant = await db.tenant.findUnique({ where: { slug: env.TENANT_SLUG } });
    if (!tenant) throw new Error(`Няма клиент „${env.TENANT_SLUG}“.`);
    const disable = env.SSO_DISABLE === '1';
    const configs = await db.ssoConfig.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    let revoked = 0;
    for (const cfg of configs) {
      await db.$transaction(async (tx) => {
        if (disable) {
          const users = await ssoSessionUsers(tx, cfg.id);
          if (users.length) revoked += (await revokeUserSessions(tx, users, 'sso_changed')).count;
        }
        await tx.ssoConfig.update({
          where: { id: cfg.id },
          data: { mode: 'OPTIONAL', ...(disable ? { enabled: false } : {}) },
        });
        await appendAudit(tx, {
          tenantId: tenant.id,
          actorId: null,
          action: 'sso.config_updated',
          objectType: 'sso_config',
          objectId: cfg.id,
          detail: { changed: disable ? ['enabled', 'mode'] : ['mode'], via: 'cli' },
        });
      });
    }
    process.stdout.write(
      `Доставчици: ${configs.length} → OPTIONAL${disable ? ` и изключени; отнети сесии: ${revoked}` : ''}.\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
