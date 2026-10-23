'use server';

import { aiConfigured, generateBio } from '@/lib/ai';
import { isLocale } from '@/i18n/locales';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// Публичният „AI био“ инструмент (/tools/bio) — без регистрация. Входът е
// само име + бележки; нищо не се записва. Лимит по IP + общ дневен таван,
// за да не се превърне в безплатен прокси към платения модел.

export type BioToolState = {
  bio?: string;
  error?: 'rate' | 'input' | 'ai' | 'off';
};

export async function publicBioAction(
  _previous: BioToolState,
  formData: FormData,
): Promise<BioToolState> {
  if (String(formData.get('company') ?? '').trim()) return {}; // honeypot
  if (!aiConfigured()) return { error: 'off' };
  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  const keywords = String(formData.get('keywords') ?? '').trim().slice(0, 300);
  const rawLocale = String(formData.get('language') ?? 'en');
  if (!keywords) return { error: 'input' };
  if (
    !rateLimit(`bio-tool:${await clientIp()}`, 5, 60 * 60_000) ||
    !rateLimit('bio-tool:global', 500, 24 * 60 * 60_000)
  ) {
    return { error: 'rate' };
  }
  const bio = await generateBio({
    name,
    keywords,
    locale: isLocale(rawLocale) ? rawLocale : 'en',
  });
  return bio ? { bio } : { error: 'ai' };
}
