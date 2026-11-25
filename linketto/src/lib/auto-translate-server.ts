// Автоматичен превод на профил — кеш в базата + Gemini (docs/geo-autotranslate-spec.md, Б).
// Към Gemini отива само публичното съдържание на профила; за посетителя — само
// целевият език. Защита на разхода (ревю): лимит по профил (20/час) + общ
// таван (AUTO_TRANSLATE_HOURLY_CAP, по подразбиране 200/час) + неуспехът се
// помни 1 час + изричното ?hl= на чужд език чете само кеша. Един превод
// наведнъж за (профил, език); чакаме ≤5 s, после показваме оригинала, а
// преводът довършва във фона за следващия посетител.

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { aiConfigured, translateProfileContent } from '@/lib/ai';
import type { TranslatableContent } from '@/lib/ai';
import {
  autoTranslateActive,
  createHourlyLimiter,
  createTtlSet,
  sourceHash,
  type AutoEntry,
} from '@/lib/auto-translate';

const allowPerProfile = createHourlyLimiter(20);
const allowGlobal = createHourlyLimiter(
  Math.max(1, Number(process.env.AUTO_TRANSLATE_HOURLY_CAP) || 200),
);
const failed = createTtlSet(60 * 60 * 1000);
const inflight = new Map<string, Promise<AutoEntry | null>>();
const WAIT_MS = 5000;

function asEntry(value: unknown): AutoEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<AutoEntry>;
  if (typeof entry.displayName !== 'string') return null;
  return {
    displayName: entry.displayName,
    bio: typeof entry.bio === 'string' ? entry.bio : undefined,
    links: entry.links && typeof entry.links === 'object' ? entry.links : {},
    products: entry.products && typeof entry.products === 'object' ? entry.products : undefined,
  };
}

/**
 * Автоматичният превод на профила на `locale` — от кеша, ако съдържанието не
 * е сменено, иначе пресен (ако е позволено и Gemini е настроен).
 * null → показва се оригиналът (+ превод в браузъра, ако е наличен).
 */
export async function autoTranslation(
  profileId: string,
  source: { from: string; content: TranslatableContent },
  locale: string,
  opts: { fresh: boolean },
): Promise<AutoEntry | null> {
  const hash = sourceHash(source);
  const cached = await prisma.autoTranslation
    .findUnique({ where: { profileId_locale: { profileId, locale } } })
    .catch(() => null);
  if (cached && cached.sourceHash === hash) return asEntry(cached.content);
  if (!opts.fresh || !aiConfigured()) return null;

  const key = `${profileId}:${locale}:${hash}`;
  let job = inflight.get(key);
  if (!job) {
    if (failed.has(key)) return null;
    // Първо лимитът по профил, после общият — отказаните по профил не харчат общия.
    if (!allowPerProfile(profileId) || !allowGlobal('global')) return null;
    job = translateProfileContent(source.content, source.from, [locale])
      .then(async (result) => {
        const entry = asEntry(result?.[locale]);
        if (!entry) {
          failed.add(key);
          return null;
        }
        // Създателят може да е изключил функцията, докато преводът е вървял —
        // тогава не пазим нищо (изключването трие кеша и трябва да остане празен).
        const profile = await prisma.profile
          .findUnique({ where: { id: profileId }, select: { autoTranslateMode: true, autoTranslateStartsAt: true } })
          .catch(() => null);
        if (!profile || !autoTranslateActive(profile)) return entry;
        await prisma.autoTranslation
          .upsert({
            where: { profileId_locale: { profileId, locale } },
            create: { profileId, locale, sourceHash: hash, content: entry as Prisma.InputJsonValue },
            update: { sourceHash: hash, content: entry as Prisma.InputJsonValue },
          })
          .catch(() => undefined);
        return entry;
      })
      .catch(() => {
        failed.add(key);
        return null;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), WAIT_MS);
  });
  try {
    return await Promise.race([job, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
