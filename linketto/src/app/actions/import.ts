'use server';

import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { dash } from '@/lib/dashboard-url';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { parseBlockInput } from '@/lib/blocks';
import { fetchCapped } from '@/lib/safe-fetch';
import { linktreeUsername, parseLinktreeHtml } from '@/lib/linktree-import';
import { saveUploadedImage } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { parseStyle } from '@/lib/style';

// „Пренеси от Linktree“: създателят дава СВОЯ публичен linktr.ee адрес и
// ние пренасяме линковете, заглавията, биото и аватара. Хостът е фиксиран
// (само https://linktr.ee/<име>), без пренасочвания, с таймаут и таван на
// размера. Съществуващите блокове не се пипат — новите отиват най-отдолу.
export async function importLinktreeAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);

  const profileId = String(formData.get('profileId') ?? '');
  const username = linktreeUsername(String(formData.get('source') ?? ''));
  // Потвърждение, че страницата е негова (пренасяме само собствено съдържание).
  if (!username || formData.get('own') !== 'on') {
    redirect(await dash(uiLocale, '?error=import'));
  }
  if (!rateLimit(`import:${user.id}`, 5, 60 * 60_000)) {
    redirect(await dash(uiLocale, '?error=import'));
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: {
      translations: true,
      _count: { select: { links: true } },
    },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));

  const page = await fetchCapped(`https://linktr.ee/${username}`, {
    maxBytes: 3 * 1024 * 1024,
    accept: 'text/html',
  });
  const parsed =
    page && page.contentType.includes('text/html')
      ? parseLinktreeHtml(page.body.toString('utf8'), username)
      : null;
  if (!parsed || parsed.blocks.length === 0) {
    redirect(await dash(uiLocale, '?error=import'));
  }

  // Всеки блок минава през същата валидация като ръчно добавения.
  const blocks = parsed.blocks.flatMap((block) => {
    const input = parseBlockInput({
      kind: block.kind,
      url: block.kind === 'LINK' ? block.url : '',
      extra1: '',
      extra2: '',
    });
    return input ? [{ input, title: block.title }] : [];
  });
  await prisma.$transaction(
    blocks.map(({ input, title }, index) =>
      prisma.link.create({
        data: {
          profileId: profile.id,
          kind: input.kind,
          url: input.url,
          meta: input.meta ? (input.meta as Prisma.InputJsonValue) : undefined,
          position: profile._count.links + index,
          translations: {
            create: { locale: profile.defaultLocale, title },
          },
        },
      }),
    ),
  );

  // Био и име — само ако са празни/автоматични (написаното не се презаписва).
  const main = profile.translations.find(
    (tr) => tr.locale === profile.defaultLocale,
  );
  if (main) {
    const data = {
      ...(!main.bio && parsed.bio ? { bio: parsed.bio } : {}),
      ...(main.displayName === profile.slug && parsed.displayName
        ? { displayName: parsed.displayName }
        : {}),
    };
    if (Object.keys(data).length > 0) {
      await prisma.profileTranslation.update({ where: { id: main.id }, data });
    }
  }

  // Аватарът — само ако липсва; сваля се от CDN-а на Linktree и минава през
  // sharp (маха EXIF, прекодира в webp) като всяко качване.
  const style = parseStyle(profile.style);
  if (!style.avatarUrl && parsed.avatarUrl) {
    const image = await fetchCapped(parsed.avatarUrl, {
      maxBytes: 5 * 1024 * 1024,
      accept: 'image/jpeg,image/png,image/webp',
    });
    const type = image?.contentType.split(';')[0].trim() ?? '';
    if (image && ['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
      const saved = await saveUploadedImage(
        new File([new Uint8Array(image.body)], 'avatar', { type }),
        'avatar',
      );
      if (saved) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { style: { ...style, avatarUrl: saved } },
        });
      }
    }
  }

  redirect(await dash(uiLocale, `?imported=${blocks.length}`));
}
