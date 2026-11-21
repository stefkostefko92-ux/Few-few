import type { Metadata } from 'next';
import { NewsletterTokenPage } from '@/components/newsletter/NewsletterTokenPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string; invalid?: string }>;
}) {
  const { slug } = await params;
  const { token, invalid } = await searchParams;
  return <NewsletterTokenPage slug={slug} token={token ?? ''} mode="confirm" invalid={invalid === '1'} />;
}
