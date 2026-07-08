import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  loadProfileBy,
  profileMetadata,
  ProfileScreen,
} from '@/components/ProfileScreen';

// Собствен домейн (платени планове): middleware пренаписва заявките към
// чужди хостове до /d/<host>, а тук домейнът се резолвира до профил.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  return profileMetadata(
    await loadProfileBy({ customDomain: domain.toLowerCase() }),
  );
}

export default async function CustomDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{
    hl?: string;
    sent?: string;
    formError?: string;
    shopError?: string;
  }>;
}) {
  const { domain } = await params;
  const { hl, sent, formError, shopError } = await searchParams;
  const profile = await loadProfileBy({ customDomain: domain.toLowerCase() });
  if (!profile || !profile.published || profile.translations.length === 0) {
    notFound();
  }
  return (
    <ProfileScreen
      profile={profile}
      hl={hl}
      sent={sent}
      formError={formError}
      shopError={shopError}
    />
  );
}
