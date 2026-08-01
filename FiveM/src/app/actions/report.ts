'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { withinGlobalRateLimit } from '@/lib/rate-limit';

/**
 * Сигнал за незаконно съдържание — чл. 16 от Регламент (ЕС) 2022/2065 (DSA).
 * Механизмът трябва да е изцяло електронен и да УЛЕСНЯВА подаването на
 * четирите елемента по чл. 16(2), затова всяко от тях е отделно задължително
 * поле, а не свободен имейл.
 */
const reportSchema = z.object({
  targetUrl: z.string().trim().max(300).url('Посочи точния адрес на съдържанието'),
  reason: z.string().trim().min(20, 'Опиши защо съдържанието е незаконно').max(4000),
  reporterName: z.string().trim().min(2, 'Името е задължително').max(120),
  reporterEmail: z.string().trim().max(120).email('Невалиден имейл'),
  goodFaith: z.literal('on', {
    errorMap: () => ({ message: 'Декларацията за добросъвестност е задължителна' }),
  }),
});

export async function submitReportAction(formData: FormData): Promise<void> {
  if (String(formData.get('website') ?? '').length > 0) redirect('/report?ok=1');
  if (!withinGlobalRateLimit('report')) redirect('/report?error=rate_limit');

  const value = (name: string) => {
    const raw = formData.get(name);
    if (typeof raw !== 'string') return undefined;
    return raw.trim() === '' ? undefined : raw;
  };

  const parsed = reportSchema.safeParse({
    targetUrl: value('targetUrl'),
    reason: value('reason'),
    reporterName: value('reporterName'),
    reporterEmail: value('reporterEmail'),
    goodFaith: value('goodFaith'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    redirect(`/report?error=invalid&field=${encodeURIComponent(String(issue?.path[0] ?? ''))}`);
  }

  try {
    await prisma.report.create({
      data: {
        targetUrl: parsed.data.targetUrl,
        reason: parsed.data.reason,
        reporterName: parsed.data.reporterName,
        reporterEmail: parsed.data.reporterEmail,
        goodFaith: true,
      },
    });
  } catch (error) {
    console.error('[report] записът се провали', error);
    redirect('/report?error=storage');
  }

  redirect('/report?ok=1');
}
