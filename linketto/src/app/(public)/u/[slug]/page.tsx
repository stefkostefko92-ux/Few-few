import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  loadProfileBy,
  profileMetadata,
  ProfileScreen,
} from '@/components/ProfileScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return profileMetadata(await loadProfileBy({ slug }));
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    hl?: string;
    sent?: string;
    formError?: string;
    shopError?: string;
  }>;
}) {
  const { slug } = await params;
  const { hl, sent, formError, shopError } = await searchParams;
  const profile = await loadProfileBy({ slug });
  if (
    !profile ||
    !profile.published ||
    profile.bannedAt ||
    profile.translations.length === 0
  ) {
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
