import type { Prisma } from '@prisma/client';

import { prisma } from './db';
import { groupByPlatform, type StreamPlatformId } from './streamers';

/** Публичните полета на стриймър — нищо повече не напуска базата. */
export const publicStreamerSelect = {
  id: true,
  platform: true,
  channel: true,
  displayName: true,
  profileUrl: true,
  live: true,
  viewers: true,
  streamTitle: true,
  lastLiveAt: true,
} satisfies Prisma.StreamerSelect;

export type PublicStreamer = Prisma.StreamerGetPayload<{ select: typeof publicStreamerSelect }>;

/**
 * Публичният списък: само одобрените. `PENDING` чака човек, `REJECTED` значи
 * възражение по чл. 21 ОРЗД — и двете НЕ се показват.
 */
export async function listPublicStreamers(): Promise<
  { platform: StreamPlatformId; streamers: PublicStreamer[] }[]
> {
  try {
    const rows = await prisma.streamer.findMany({
      where: { status: 'APPROVED' },
      select: publicStreamerSelect,
      orderBy: [{ live: 'desc' }, { viewers: 'desc' }, { displayName: 'asc' }],
      take: 300,
    });
    return groupByPlatform(rows as (PublicStreamer & { platform: StreamPlatformId })[]);
  } catch (error) {
    console.error('[streamers] списъкът не се прочете', error);
    return [];
  }
}

export async function streamerCounts(): Promise<{ total: number; live: number }> {
  try {
    const [total, live] = await prisma.$transaction([
      prisma.streamer.count({ where: { status: 'APPROVED' } }),
      prisma.streamer.count({ where: { status: 'APPROVED', live: true } }),
    ]);
    return { total, live };
  } catch (error) {
    console.error('[streamers] броенето се провали', error);
    return { total: 0, live: 0 };
  }
}
