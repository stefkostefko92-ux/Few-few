// Round 48: the notice of a correction of the engines that changes documents a company already issued. A record the
// running engines no longer reproduce is marked «da aggiornare» in the app, and nothing else tells the company. This
// recomputes, for every active company, the saved records of its live installations made with older engines, the way
// «Aggiorna con il software attuale» would make them again (scripts/engine-records.ts), and compares the result with
// what each record stored: the verdict, the counts of failed and warned checks and, where the record keeps them, the
// state of each check (scripts/engine-diff.ts). A record whose input the running engines refuse changes too; a new
// version alone changes nothing. Each company with at least one changed record gets, with --send, ONE e-mail to its
// Titolare (mail kind 'engineNotice'): what was corrected (--motivo, written by the owner of the platform), the engine
// version, how many installations and records change, what to do; the activity log keeps it (ENGINE_NOTICE_SENT,
// meta.engine = the four versions), and a company told for these versions is never told again (docs/terms-changes.md §8).
//   npm run engine:notice                                  the list: company, records, changed checks (writes nothing)
//   npm run engine:notice -- --send --motivo "<testo>"     sends; on the server: docker exec liftpilot-app-1 npm run …
// Run it after the deploy of the new engines. It needs DATABASE_URL; --send also the mail settings (src/lib/smtp.ts).
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { ENGINE_VERSION } from '../src/calc/snapshot';
import { DEFAULT_LOCALE, isLocale } from '../src/i18n/locales';
import { parseEnv } from '../src/lib/env-schema';
import { LIFT_ENGINE_VERSION } from '../src/lib/lift/version';
import { accountMail } from '../src/lib/mail-templates';
import { ROOM_ENGINE_VERSION } from '../src/lib/room/snapshot';
import { smtpConfigured, smtpFailure, smtpTransport } from '../src/lib/smtp';
import { SHAFT_ENGINE_VERSION } from '../src/shaft/snapshot';
import { byCompany, changeOf, describe, noticeKey, parseArgs, type Changed, type Kind } from './engine-diff';
import { recomputeAll } from './engine-records';

/** The four running versions: the key of this notice in the activity log. */
export const RUNNING_KEY = noticeKey({ calc: ENGINE_VERSION, lift: LIFT_ENGINE_VERSION, room: ROOM_ENGINE_VERSION, shaft: SHAFT_ENGINE_VERSION });

async function main(db: PrismaClient): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) { process.stderr.write(`${args.error}\n`); return 2; }
  const e = args.send ? parseEnv(process.env) : null;
  if (e && !smtpConfigured(e)) { process.stderr.write('no mail settings (SMTP_HOST, MAIL_FROM): nothing sent\n'); return 1; }
  const mailer = e ? smtpTransport(e) : null, base = e ? e.PUBLIC_BASE_URL.replace(/\/+$/, '') : '';

  const rows = await recomputeAll(db);
  const changed: Changed[] = rows.flatMap((r) => {
    const change = changeOf(r.stored, r.now);
    return change ? [{ kind: r.kind, id: r.id, owner: r.owner, companyId: r.companyId, projectId: r.projectId, project: r.project, change }] : [];
  });
  const groups = byCompany(changed), ids = groups.map((g) => g.companyId);
  const [companies, owners, told] = await Promise.all([
    db.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { companyId: { in: ids }, role: 'OWNER', active: true }, select: { companyId: true, email: true, locale: true }, orderBy: { createdAt: 'asc' } }),
    db.auditLog.findMany({ where: { companyId: { in: ids }, action: 'ENGINE_NOTICE_SENT', meta: { path: ['engine'], equals: RUNNING_KEY } }, select: { companyId: true } }),
  ]);
  const name = new Map(companies.map((c) => [c.id, c.name])), done = new Set(told.map((t) => t.companyId));
  const count = (k: Kind): number => rows.filter((r) => r.kind === k).length;
  process.stdout.write(`engines ${RUNNING_KEY}: ${rows.length} record(s) made with older engines recomputed (calc ${count('calc')}, lift ${count('lift')}, `
    + `room ${count('room')}, shaft ${count('shaft')}); result changed: ${changed.length} in ${groups.length} company(ies)`
    + `${args.send ? '' : ' — dry run, nothing sent (--send --motivo "<testo>" sends)'}\n`);

  let failed = 0;
  for (const g of groups) {
    const to = owners.filter((o) => o.companyId === g.companyId);
    const state = done.has(g.companyId) ? 'already told for these engines' : to.length ? (mailer ? 'telling' : 'to tell') : 'no active Titolare: not told';
    process.stdout.write(`\n${name.get(g.companyId) ?? '?'} [${g.companyId}] — impianti ${g.impianti}, elaborati ${g.elaborati} (records ${g.records.length}) — ${state}\n`);
    for (const r of g.records) process.stdout.write(`  ${r.kind} ${r.id} «${r.project}»: ${describe(r.change)}\n`);
    if (!mailer || !e || !args.motivo || done.has(g.companyId) || !to.length) continue;
    const locale = isLocale(to[0].locale) ? to[0].locale : DEFAULT_LOCALE;
    try {
      // one e-mail per company, to its Titolare (every active owner of it, in one message)
      await mailer.sendMail({ from: e.MAIL_FROM, to: to.map((o) => o.email),
        ...accountMail({ kind: 'engineNotice', engine: ENGINE_VERSION, motivo: args.motivo, impianti: g.impianti, records: g.elaborati }, locale, base) });
    } catch (err) {
      failed += 1;
      process.stdout.write(`  — not sent ${JSON.stringify(smtpFailure(err))}\n`);
      continue;
    }
    await db.auditLog.create({ data: { companyId: g.companyId, userId: null, action: 'ENGINE_NOTICE_SENT', entity: 'Company', entityId: g.companyId,
      meta: { engine: RUNNING_KEY, records: g.records.length, elaborati: g.elaborati, impianti: g.impianti, motivo: args.motivo } } });
    process.stdout.write('  — sent\n');
  }
  if (failed) process.stderr.write(`${failed} e-mail(s) not sent: run it again (the companies told are not told twice)\n`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  try {
    process.exitCode = await main(db);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
