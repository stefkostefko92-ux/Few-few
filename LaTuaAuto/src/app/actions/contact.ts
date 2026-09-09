'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';

const schema = z.object({
  email: z.string().trim().email().max(254),
  body: z.string().trim().min(10).max(4000),
  locale: z.string().refine(isLocale),
  website: z.string().max(0), // honeypot — ботовете го попълват
});

export type ContactState = { status: 'idle' | 'sent' | 'error' };

// Публично действие: zod вход, honeypot, без PII в логове. Пази се 12 месеца.
export async function sendContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    body: formData.get('body'),
    locale: formData.get('locale'),
    website: formData.get('website') ?? '',
  });
  if (!parsed.success) return { status: 'error' };
  try {
    await prisma.contactMessage.create({
      data: { email: parsed.data.email, body: parsed.data.body, locale: parsed.data.locale },
    });
    return { status: 'sent' };
  } catch {
    return { status: 'error' };
  }
}
