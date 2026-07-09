'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { REPORT_CATEGORIES } from '@/lib/report';

// DSA чл. 16 „уведомяване и действие“: публичен сигнал за профил.
// Без акаунт, с honeypot срещу ботове; имейлът е по избор (за обратна връзка).

const reportSchema = z.object({
  slug: z.string().min(1).max(60),
  hl: z.string().max(5),
  category: z.enum(REPORT_CATEGORIES),
  message: z.string().trim().min(10).max(2000),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
});

export async function submitReportAction(formData: FormData): Promise<void> {
  // Honeypot: ботовете попълват скритото поле.
  if (String(formData.get('website') ?? '') !== '') {
    redirect('/');
  }
  const parsed = reportSchema.safeParse({
    slug: formData.get('slug'),
    hl: formData.get('hl') ?? 'en',
    category: formData.get('category'),
    message: formData.get('message'),
    email: formData.get('email') ?? '',
  });
  if (!parsed.success) {
    redirect('/');
  }
  const { slug, hl, category, message, email } = parsed.data;
  const profile = await prisma.profile.findUnique({ where: { slug } });
  if (!profile) redirect('/');

  await prisma.report.create({
    data: {
      profileId: profile.id,
      category,
      message,
      email: email || null,
    },
  });
  redirect(`/u/${slug}/report?hl=${hl}&sent=1`);
}
