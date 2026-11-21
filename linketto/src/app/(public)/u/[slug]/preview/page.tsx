import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadProfileBy, ProfileScreen } from '@/components/ProfileScreen';
import { getSessionUser } from '@/lib/auth';
import { planFor } from '@/lib/plans';
import { applyDraft, decodeDraft } from '@/lib/preview-draft';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
};

/**
 * Живият преглед от таблото (iframe). Само за собственика на профила —
 * за всеки друг е 404, без да издава дали профилът съществува. Показва и
 * непубликуван профил. Незапазените промени идват като чернова (?d=),
 * валидират се като при запис и НЕ се записват; посещение не се брои.
 * X-Frame-Options за този път е SAMEORIGIN (next.config.mjs).
 */
export default async function ProfilePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hl?: string; d?: string }>;
}) {
  const { slug } = await params;
  const { hl, d } = await searchParams;
  const user = await getSessionUser();
  if (!user) notFound();
  const profile = await loadProfileBy({ slug });
  if (!profile || profile.userId !== user.id) notFound();
  const draft = decodeDraft(d);
  const shown = draft
    ? applyDraft(profile, draft, { canHideBadge: planFor(user.plan).hideBadge })
    : profile;
  if (shown.translations.length === 0) notFound();
  return <ProfileScreen profile={shown} hl={hl} preview />;
}
