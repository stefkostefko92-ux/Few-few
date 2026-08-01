'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { withinGlobalRateLimit } from '@/lib/rate-limit';
import type { FormErrorCode } from '@/lib/messages';

/**
 * Ревю от посетител. Съществуването на този път е правно съществено: без него
 * всяко ревю на сайта би било вписано от оператора, а това е забранена
 * търговска практика при всички обстоятелства (Прил. I, т. 23в от Дир.
 * 2005/29/ЕО — „фалшиви потребителски отзиви“). Затова: ревюта се създават САМО
 * тук, от посетители, и никога не се сийдват.
 *
 * Не искаме и не пазим име, имейл или IP — само оценка, текст и псевдоним.
 */
const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
  authorAlias: z.string().trim().max(40).optional(),
});

function fail(slug: string, code: FormErrorCode): never {
  redirect(`/servers/${encodeURIComponent(slug)}?error=${code}#ревю`);
}

export async function submitReviewAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '').slice(0, 60);
  if (!slug) redirect('/');

  if (String(formData.get('website') ?? '').length > 0) redirect(`/servers/${slug}?review=ok`);
  if (!withinGlobalRateLimit('review')) fail(slug, 'rate_limit');

  const value = (name: string) => {
    const raw = formData.get(name);
    if (typeof raw !== 'string') return undefined;
    return raw.trim() === '' ? undefined : raw;
  };

  const parsed = reviewSchema.safeParse({
    rating: value('rating'),
    body: value('body'),
    authorAlias: value('authorAlias'),
  });
  if (!parsed.success) fail(slug, 'invalid_rating');

  // `redirect()` работи чрез хвърляне на NEXT_REDIRECT — затова НИКОГА не се
  // вика вътре в `try`, който има `catch`: собственият ни catch би го глътнал
  // и потребителят би останал на страницата без нищо да се е случило.
  let stored: 'ok' | 'missing' | 'failed' = 'failed';
  try {
    const server = await prisma.server.findFirst({
      where: { slug, status: 'APPROVED' },
      select: { id: true },
    });
    if (!server) {
      stored = 'missing';
    } else {
      await prisma.review.create({
        data: {
          serverId: server.id,
          rating: parsed.data.rating,
          body: parsed.data.body ?? null,
          authorAlias: parsed.data.authorAlias ?? null,
        },
      });
      stored = 'ok';
    }
  } catch (error) {
    console.error('[review] записът се провали', error);
  }

  if (stored === 'missing') redirect('/');
  if (stored === 'failed') fail(slug, 'storage');

  redirect(`/servers/${slug}?review=ok`);
}
