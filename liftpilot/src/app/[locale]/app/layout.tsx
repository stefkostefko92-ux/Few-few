import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth';
import AppTopbar from '@/components/AppTopbar';
import BillingBanner from '@/components/BillingBanner';
import Footer from '@/components/Footer';

// The application is never indexed. Each page checks the session and the rights itself (requireUser).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  return (
    <>
      <AppTopbar user={user} />
      <BillingBanner user={user} />
      {children}
      <Footer />
    </>
  );
}
