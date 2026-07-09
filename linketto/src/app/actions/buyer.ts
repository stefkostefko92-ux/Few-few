'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { createBuyerMagicToken, logoutBuyer } from '@/lib/buyer-auth';
import { isValidEmail, normalizeEmail } from '@/lib/newsletter';
import { buyerAccessHtml, buyerAccessSubject, sendEmail } from '@/lib/email';

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

// Купувачът иска линк за достъп до курс/членство. Пращаме magic-link САМО
// ако имейлът има активно право (иначе тихо — не издаваме кой е купил).
export async function requestAccessAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const learn = `/u/${slug}/learn/${productId}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!isValidEmail(email)) {
    redirect(`${learn}${hl ? '&' : '?'}accessError=1`);
  }
  const entitlement = await prisma.entitlement.findUnique({
    where: { productId_email: { productId, email } },
    include: { product: { include: { translations: true } } },
  });
  if (entitlement?.active) {
    const locale = isLocale(hl) ? hl : undefined;
    const token = await createBuyerMagicToken(email);
    const next = `/u/${slug}/learn/${productId}`;
    const accessUrl = `${baseUrl()}/buyer/verify?token=${token}&next=${encodeURIComponent(next)}`;
    const title =
      entitlement.product.translations.find((t) => t.locale === locale)
        ?.title ??
      entitlement.product.translations[0]?.title ??
      'Linketto';
    await sendEmail({
      to: email,
      subject: buyerAccessSubject(locale),
      html: buyerAccessHtml({ productTitle: title, accessUrl, locale }),
    });
  }
  // Винаги един и същ отговор (без изтичане на информация).
  redirect(`${learn}${hl ? '&' : '?'}sent=1`);
}

export async function buyerLogoutAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const productId = String(formData.get('productId') ?? '');
  await logoutBuyer();
  redirect(`/u/${slug}/learn/${productId}`);
}
