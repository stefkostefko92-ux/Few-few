'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { generateReferralCode } from '@/lib/referral';

// Създава реферален код за потребители без такъв (регистрирани преди
// програмата). Новите получават код автоматично при регистрация.
export async function ensureReferralCodeAction(
  formData: FormData,
): Promise<void> {
  const raw = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(raw) ? raw : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  if (user.referralCode) redirect(`/${uiLocale}/dashboard`);

  // Малко повторни опита при рядка колизия на кода (unique).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: generateReferralCode() },
      });
      break;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }
  redirect(`/${uiLocale}/dashboard`);
}
