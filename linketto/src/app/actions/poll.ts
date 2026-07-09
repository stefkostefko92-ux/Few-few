'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

// Публично: посетител гласува в анкета (POLL блок). Агрегат без бисквитки —
// пазим само индекса на опцията. Повторно гласуване се спира best-effort от
// клиента (localStorage), не чрез бисквитки/PII.
export async function votePollAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const linkId = String(formData.get('linkId') ?? '');
  const optionIndex = Number(formData.get('optionIndex'));
  const back = `/u/${slug}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;

  if (!linkId || !Number.isInteger(optionIndex) || optionIndex < 0) {
    redirect(back);
  }
  const link = await prisma.link.findFirst({
    where: {
      id: linkId,
      kind: 'POLL',
      active: true,
      profile: { slug, published: true, bannedAt: null },
    },
    select: { id: true, meta: true },
  });
  if (link) {
    const options = Array.isArray(
      (link.meta as { options?: unknown } | null)?.options,
    )
      ? ((link.meta as { options: unknown[] }).options as unknown[])
      : [];
    if (optionIndex < options.length) {
      await prisma.pollVote
        .create({ data: { linkId, optionIndex } })
        .catch(() => undefined);
    }
  }
  // Отбелязваме гласувалата анкета за резултатите; котва към блока.
  const sep = back.includes('?') ? '&' : '?';
  redirect(`${back}${sep}voted=${linkId}#poll-${linkId}`);
}
