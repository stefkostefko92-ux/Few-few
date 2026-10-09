import type { PresenceStatus, PrismaClient } from '@prisma/client';
import { memberConversationWhere, type Viewer } from './access.js';

/**
 * Присъствие (FR-18): само за координация между колеги. НЕ е доказателство за дежурство,
 * работно време или наличност — не се ползва за отчети, ескалации или надзор (§15, кратка
 * ретенция). Клиентът праща heartbeat на 60 s; OFFLINE се изчислява при ЧЕТЕНЕ (3 мин без
 * heartbeat), без cron и без събитие. Вижда се само за хора, с които делиш разговор; порталът —
 * само персонала в своите разговори. `showLastSeen=false` скрива „последно видян“.
 */

export const HEARTBEAT_EVERY_MS = 60 * 1000;
export const OFFLINE_AFTER_MS = 3 * 60 * 1000;

export interface PresenceRow {
  status: PresenceStatus;
  lastSeenAt: Date;
  showLastSeen: boolean;
}

export interface PresenceView {
  status: PresenceStatus;
  lastSeenAt: Date | null;
}

export function effectivePresence(row: PresenceRow | null, now: Date, self = false): PresenceView {
  if (!row) return { status: 'OFFLINE', lastSeenAt: null };
  const stale = now.getTime() - row.lastSeenAt.getTime() > OFFLINE_AFTER_MS;
  return {
    status: stale ? 'OFFLINE' : row.status,
    lastSeenAt: self || row.showLastSeen ? row.lastSeenAt : null,
  };
}

/** От поисканите хора — тези, чието присъствие зрителят може да види (и самият той). */
export async function visiblePresenceSubjects(
  db: PrismaClient,
  viewer: Viewer,
  userIds: readonly string[],
): Promise<Set<string>> {
  const others = userIds.filter((id) => id !== viewer.id);
  const visible = new Set<string>(userIds.includes(viewer.id) ? [viewer.id] : []);
  if (others.length === 0) return visible;
  const rows = await db.conversationMember.findMany({
    where: {
      userId: { in: others },
      user: {
        tenantId: viewer.tenantId,
        active: true,
        ...(viewer.kind === 'PORTAL' ? { kind: 'INTERNAL' as const } : {}),
      },
      conversation: memberConversationWhere(viewer),
    },
    distinct: ['userId'],
    select: { userId: true },
  });
  for (const r of rows) visible.add(r.userId);
  return visible;
}

/** Хората, с които субектът дели разговор — кандидатите за `presence.changed`. */
export async function presenceAudience(db: PrismaClient, subject: Viewer): Promise<string[]> {
  const rows = await db.conversationMember.findMany({
    where: { conversation: memberConversationWhere(subject), userId: { not: subject.id } },
    distinct: ['userId'],
    select: { userId: true },
    take: 2000,
  });
  return rows.map((r) => r.userId);
}
