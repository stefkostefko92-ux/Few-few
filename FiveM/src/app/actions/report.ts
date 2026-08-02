'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { reportReceipt, sendMail } from '@/lib/email';
import { withinGlobalRateLimit } from '@/lib/rate-limit';
import { readLocale } from './locale';

/**
 * Сигнал за незаконно съдържание — чл. 16 от Регламент (ЕС) 2022/2065 (DSA).
 * Механизмът трябва да е изцяло електронен и да УЛЕСНЯВА подаването на
 * четирите елемента по чл. 16(2), затова всяко от тях е отделно задължително
 * поле, а не свободен имейл.
 */
const reportSchema = z
  .object({
    targetUrl: z.string().trim().max(300).url('Посочи точния адрес на съдържанието'),
    reason: z.string().trim().min(20, 'Опиши защо съдържанието е незаконно').max(4000),
    reporterName: z.string().trim().min(2, 'Името е задължително').max(120).optional(),
    reporterEmail: z.string().trim().max(120).email('Невалиден имейл').optional(),
    /**
     * Подателят заявява, че сигналът е за престъпленията по чл. 3–7 от
     * Дир. 2011/93/ЕС. Тогава чл. 16(2)(в) DSA ИЗРИЧНО не изисква име и имейл.
     */
    anonymousAllowed: z.literal('on').optional(),
    goodFaith: z.literal('on', {
      errorMap: () => ({ message: 'Декларацията за добросъвестност е задължителна' }),
    }),
  })
  // Контактите са задължителни ПО ПОДРАЗБИРАНЕ и отпадат само при изричното
  // изключение. Безусловно задължителни, те бяха по-ограничителни от закона и
  // възпираха точно най-тежкия сигнал.
  .refine((data) => data.anonymousAllowed === 'on' || (data.reporterName && data.reporterEmail), {
    message: 'Нужни са име и имейл, освен ако сигналът е по чл. 3–7 от Дир. 2011/93/ЕС',
    path: ['reporterName'],
  });

export async function submitReportAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  if (String(formData.get('website') ?? '').length > 0) redirect(`/${locale}/report?ok=1`);
  if (!withinGlobalRateLimit('report')) redirect(`/${locale}/report?error=rate_limit`);

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
    anonymousAllowed: value('anonymousAllowed'),
    goodFaith: value('goodFaith'),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    redirect(
      `/${locale}/report?error=invalid&field=${encodeURIComponent(String(issue?.path[0] ?? ''))}`,
    );
  }

  try {
    await prisma.report.create({
      data: {
        targetUrl: parsed.data.targetUrl,
        reason: parsed.data.reason,
        reporterName: parsed.data.reporterName ?? null,
        reporterEmail: parsed.data.reporterEmail ?? null,
        anonymousAllowed: parsed.data.anonymousAllowed === 'on',
        goodFaith: true,
      },
    });
  } catch (error) {
    console.error('[report] записът се провали', error);
    redirect(`/${locale}/report?error=storage`);
  }

  // Потвърждението е задължение по чл. 16, ал. 4 DSA и няма забавяне.
  // Неизпратен имейл не отменя приетия сигнал — затова резултатът се логва,
  // а не се проверява.
  // Без имейл няма къде да се прати потвърждение — чл. 16(4) го изисква „при
  // предоставени данни за контакт“, тоест анонимният сигнал не е нарушение.
  if (parsed.data.reporterEmail) {
    await sendMail({ to: parsed.data.reporterEmail, ...reportReceipt(parsed.data.targetUrl) });
  }

  redirect(`/${locale}/report?ok=1`);
}
