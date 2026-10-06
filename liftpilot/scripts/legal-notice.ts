// The e-mail that announces a new version of the terms to the owners of the companies that accepted an earlier one
// (terms, article «changes»): what changes and the day it binds the company — TERMS_EFFECTIVE, or NOTICE_DAYS whole
// days after this e-mail when that is later (src/lib/legal.ts). Until that day the version the owner accepted stays in
// force; the day is kept with the owner, so a company never told is never bound (src/lib/auth.ts). Each owner is told
// once per version; the activity log keeps the e-mail (TERMS_NOTICE_SENT).
//   npm run legal:notice            what would be sent: how many owners, the day for each company
//   npm run legal:notice -- --send  sends, on the server: docker compose exec -T app npm run legal:notice -- --send
// It reads the server's configuration and sends mail like the application (src/lib/env-schema.ts, src/lib/smtp.ts),
// without the server-only modules a script cannot load.
import { PrismaClient } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale } from '../src/i18n/locales';
import { TERMS_VERSION, termsBinding } from '../src/lib/legal';
import { accountMail } from '../src/lib/mail-templates';
import { parseEnv } from '../src/lib/env-schema';
import { smtpConfigured, smtpFailure, smtpTransport } from '../src/lib/smtp';

async function main(): Promise<number> {
  const send = process.argv.includes('--send');
  const e = parseEnv(process.env), base = e.PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (send && !smtpConfigured(e)) {
    process.stderr.write('no mail settings (SMTP_HOST, MAIL_FROM): nothing sent\n');
    return 1;
  }
  const mailer = send ? smtpTransport(e) : null;
  const prisma = new PrismaClient();
  try {
    const owners = await prisma.user.findMany({
      where: {
        role: 'OWNER', active: true, company: { active: true }, termsVersion: { not: TERMS_VERSION },
        OR: [{ termsNoticeVersion: null }, { termsNoticeVersion: { not: TERMS_VERSION } }],
      },
      select: { id: true, email: true, locale: true, companyId: true, company: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    process.stdout.write(`version ${TERMS_VERSION}: ${owners.length} owner(s) to tell${send ? '' : ' (dry run: --send to send)'}\n`);
    let failed = 0;
    for (const o of owners) {
      const now = new Date(), binding = termsBinding(now);
      const locale = isLocale(o.locale) ? o.locale : DEFAULT_LOCALE;
      process.stdout.write(`  ${o.company.name} [${locale}] binding ${binding.toISOString().slice(0, 10)}`);
      if (!mailer) { process.stdout.write('\n'); continue; }
      try {
        await mailer.sendMail({ from: e.MAIL_FROM, to: o.email, ...accountMail({ kind: 'termsNotice', binding }, locale, base) });
      } catch (err) {
        failed += 1;
        process.stdout.write(` — not sent ${JSON.stringify(smtpFailure(err))}\n`);
        continue;
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id: o.id }, data: { termsNoticeVersion: TERMS_VERSION, termsNoticeAt: now } }),
        prisma.auditLog.create({ data: { companyId: o.companyId, userId: null, action: 'TERMS_NOTICE_SENT', entity: 'User', entityId: o.id,
          meta: { version: TERMS_VERSION, binding: binding.toISOString(), locale } } }),
      ]);
      process.stdout.write(' — sent\n');
    }
    if (failed) process.stderr.write(`${failed} e-mail(s) not sent: run it again (the owners told are not told twice)\n`);
    return failed ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code), (err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
