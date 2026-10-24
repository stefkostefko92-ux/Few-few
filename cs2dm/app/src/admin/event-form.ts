import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  EVENT_HORIZON_DAYS,
  EVENT_KINDS,
  EVENT_MAX_DAYS,
  EVENT_TITLE_MAX,
  zonedToUtc,
  type EventKind,
} from '../events.js';
import { multiplierTenths, parseMultiplier, safeChatText } from '../settings.js';
import { first, requiredString } from './forms.js';
import { DM_MODES } from './server-data.js';

/**
 * Формата на събитие (CONTRACT §12) → проверена стойност. Заглавията отиват в чата на играта →
 * чистят се като чата; часовете са местни за сайта (DISPLAY_TZ); правилата на вида — MODE иска
 * режим, XP_BOOST — множител над 1. Застъпването се проверява в транзакцията (`overlapping`).
 */
const DAY_MS = 86_400_000;
const localTime = z.preprocess(first, z.string().trim().max(16));
const optionalMode = z.preprocess((value) => {
  const one = first(value);
  return typeof one === 'string' && one.trim() === '' ? undefined : one;
}, z.coerce.number().int().min(0).max(1000).optional());

const eventFields = z.object({
  kind: z.preprocess(first, z.enum(EVENT_KINDS)),
  titleBg: requiredString(200),
  titleEn: requiredString(200),
  titleIt: requiredString(200),
  startsAt: localTime,
  endsAt: localTime,
  xpMultiplier: z.preprocess(first, z.string().max(8)),
  dmModeId: optionalMode,
});

export interface EventInput {
  kind: EventKind;
  titleBg: string;
  titleEn: string;
  titleIt: string;
  startsAt: Date;
  endsAt: Date;
  xpTenths: number;
  dmModeId: number | null;
}

export function eventFromForm(body: unknown, timeZone: string, now: Date): EventInput | null {
  const parsed = eventFields.safeParse(body ?? {});
  if (!parsed.success) return null;
  const input = parsed.data;
  const titles = [input.titleBg, input.titleEn, input.titleIt].map((title) =>
    safeChatText(title, EVENT_TITLE_MAX),
  );
  if (titles.some((title) => title.length === 0)) return null;
  const startsAt = zonedToUtc(input.startsAt, timeZone);
  const endsAt = zonedToUtc(input.endsAt, timeZone);
  const multiplier = parseMultiplier(input.xpMultiplier);
  if (!startsAt || !endsAt || multiplier === null) return null;
  const span = endsAt.getTime() - startsAt.getTime();
  if (span <= 0 || span > EVENT_MAX_DAYS * DAY_MS) return null;
  if (endsAt.getTime() <= now.getTime()) return null;
  if (startsAt.getTime() > now.getTime() + EVENT_HORIZON_DAYS * DAY_MS) return null;
  const dmModeId = input.dmModeId ?? null;
  if (dmModeId !== null && !DM_MODES.some((mode) => mode.id === dmModeId)) return null;
  const xpTenths = multiplierTenths(multiplier);
  if (input.kind === 'MODE' && dmModeId === null) return null;
  if (input.kind === 'XP_BOOST' && xpTenths <= 10) return null;
  return {
    kind: input.kind,
    titleBg: titles[0]!,
    titleEn: titles[1]!,
    titleIt: titles[2]!,
    startsAt,
    endsAt,
    xpTenths,
    dmModeId,
  };
}

/** Данните за Prisma (множителят като десетично число от десети — без float). */
export function eventData(input: EventInput) {
  return {
    kind: input.kind,
    titleBg: input.titleBg,
    titleEn: input.titleEn,
    titleIt: input.titleIt,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    xpMultiplier: new Prisma.Decimal(input.xpTenths).div(10),
    dmModeId: input.dmModeId,
  };
}

/** Събитие за одита: само сериализуеми стойности (дати ISO, множител като „1.5“). */
export function eventJson(event: {
  kind: string;
  titleBg: string;
  titleEn: string;
  titleIt: string;
  startsAt: Date;
  endsAt: Date;
  xpMultiplier: Prisma.Decimal;
  dmModeId: number | null;
}) {
  return {
    kind: event.kind,
    titleBg: event.titleBg,
    titleEn: event.titleEn,
    titleIt: event.titleIt,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    xpMultiplier: event.xpMultiplier.toFixed(1),
    dmModeId: event.dmModeId,
  };
}

/**
 * Застъпване с друго неотменено събитие (освен `exceptId`). Пускай в транзакцията след
 * `lockEvents` — двама админи едновременно не могат да минат и двамата (и EXCLUDE в базата пази).
 */
export async function overlapping(
  tx: Prisma.TransactionClient,
  startsAt: Date,
  endsAt: Date,
  exceptId: number | null,
): Promise<boolean> {
  const found = await tx.scheduledEvent.findFirst({
    where: {
      cancelledAt: null,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(exceptId === null ? {} : { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  return found !== null;
}

export async function lockEvents(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cs2dm_events'))`;
}
