import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import AppTopbar from '@/components/AppTopbar';
import BillingBanner from '@/components/BillingBanner';
import TermsBanner from '@/components/TermsBanner';
import Footer from '@/components/Footer';

// The application is never indexed. Each page checks the session and the rights itself (requireUser).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  // every message for the application's client components (the public layout sends only its own)
  return (
    <NextIntlClientProvider>
      <AppTopbar user={user} />
      <TermsBanner user={user} />
      <BillingBanner user={user} />
      {children}
      <Footer />
    </NextIntlClientProvider>
  );
}
