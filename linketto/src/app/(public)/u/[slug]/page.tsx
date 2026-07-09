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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hl?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { hl } = await searchParams;
  return profileMetadata(await loadProfileBy({ slug }), hl);
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
    couponError?: string;
    subscribed?: string;
    subError?: string;
    unsub?: string;
    voted?: string;
  }>;
}) {
  const { slug } = await params;
  const {
    hl,
    sent,
    formError,
    shopError,
    couponError,
    subscribed,
    subError,
    unsub,
    voted,
  } = await searchParams;
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
      couponError={couponError}
      subscribed={subscribed}
      subError={subError}
      unsub={unsub}
      voted={voted}
    />
  );
}
