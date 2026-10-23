import { getTranslations } from 'next-intl/server';
import type { Verdict } from '@prisma/client';
import type { VerdictKind } from '@/lib/verdict-checks';
import VerdictChecks from './VerdictChecks';

const CLS: Record<Verdict, string> = { OK: 'ok', WARN: 'warn', FAIL: 'fail' };

/** A saved record's result as stored (its counts). With `record`, a result that does not pass or passes with warnings is
 *  a button that shows every check behind its count (VerdictChecks); a pass stays a plain tag. */
export default async function VerdictPill({ verdict, fails, warns, record }: {
  verdict: Verdict; fails: number; warns: number; record?: { kind: VerdictKind; id: string };
}) {
  const t = await getTranslations('calculations');
  const label = verdict === 'FAIL' ? t('verdictFail', { n: fails }) : verdict === 'WARN' ? t('verdictWarn', { n: warns }) : t('verdictOk');
  if (verdict !== 'OK' && record) return <VerdictChecks kind={record.kind} id={record.id} verdict={verdict} label={label} />;
  return <span className={`status-pill ${CLS[verdict]}`}>{label}</span>;
}
