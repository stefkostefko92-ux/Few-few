'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { canWithdraw, generateReferralCode } from '@/lib/referral';

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

// Заявка за изплащане на натрупания реферал бонус (при достигнат праг).
// Балансът се снапшотва в ReferralPayout и се нулира — броячът започва пак
// от 0 и може да се тегли отново при следващо достигане на прага.
export async function requestPayoutAction(
  formData: FormData,
): Promise<void> {
  const raw = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(raw) ? raw : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const method = String(formData.get('method') ?? '').trim().slice(0, 200);
  if (!method) redirect(`/${uiLocale}/dashboard?error=payout`);

  // Четем баланса наново под транзакция, за да няма гонка/двойно теглене.
  await prisma
    .$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({
        where: { id: user.id },
        select: { referralCreditCents: true },
      });
      const balance = fresh?.referralCreditCents ?? 0;
      if (!canWithdraw(balance)) {
        throw new Error('below-threshold');
      }
      await tx.referralPayout.create({
        data: { userId: user.id, amountCents: balance, method },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { referralCreditCents: 0 },
      });
    })
    .catch(() => {
      redirect(`/${uiLocale}/dashboard?error=payout`);
    });
  redirect(`/${uiLocale}/dashboard?payout=1`);
}
