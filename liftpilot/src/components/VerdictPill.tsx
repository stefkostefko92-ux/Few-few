import { getTranslations } from 'next-intl/server';
import type { Verdict } from '@prisma/client';

const CLS: Record<Verdict, string> = { OK: 'ok', WARN: 'warn', FAIL: 'fail' };

export default async function VerdictPill({ verdict, fails, warns }: { verdict: Verdict; fails: number; warns: number }) {
  const t = await getTranslations('calculations');
  const label = verdict === 'FAIL' ? t('verdictFail', { n: fails }) : verdict === 'WARN' ? t('verdictWarn', { n: warns }) : t('verdictOk');
  return <span className={`status-pill ${CLS[verdict]}`}>{label}</span>;
}
