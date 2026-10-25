import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { EVENT_KINDS, EVENT_TITLE_MAX, utcToZonedInput } from '../../events.js';
import { displayName } from '../../steamid.js';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import {
  eventData,
  eventFromForm,
  eventJson,
  lockEvents,
  overlapping,
  type EventInput,
} from '../event-form.js';
import { requiredInt, type ResultCode } from '../forms.js';
import { done, renderAdmin } from '../render.js';
import { DM_MODES } from '../server-data.js';

/**
 * Събитията по график (CONTRACT §12) — ADMIN+ (като режимите в §1). Списък, създаване, редакция и
 * отмяна; всяко писане е транзакция с ключалка (без застъпване) и одит `event.*` с before/after.
 * Плъгинът ги проверява на 30 s — команда по моста не е нужна. Завършило събитие не се пипа.
 */
const idParam = requiredInt(1, 2_147_483_647);
const LIST_DAYS = 30;
const BACK = '/admin/events';

/** Грешка от базата при застъпване (EXCLUDE `events_no_overlap`), ако две заявки се разминат. */
function isOverlapError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('events_no_overlap') || text.includes('23P01');
}

export function eventRoutes(ctx: AdminCtx): AdminRoute[] {
  const tz = () => config().DISPLAY_TZ;

  /** Обща рамка за писане: транзакция с ключалка → код; застъпване в базата → overlap. */
  async function write(work: (tx: Prisma.TransactionClient) => Promise<ResultCode>) {
    try {
      return await ctx.db.$transaction(async (tx) => {
        await lockEvents(tx);
        return work(tx);
      });
    } catch (error) {
      if (isOverlapError(error)) return 'overlap' as const;
      throw error;
    }
  }

  async function save(input: EventInput, actor: string, id: number | null): Promise<ResultCode> {
    return write(async (tx) => {
      if (await overlapping(tx, input.startsAt, input.endsAt, id)) return 'overlap';
      if (id === null) {
        const created = await tx.scheduledEvent.create({
          data: { ...eventData(input), createdBy: actor },
        });
        await audit(tx, {
          actor,
          action: 'event.create',
          details: { id: created.id, after: eventJson(created) },
        });
        return 'saved';
      }
      const old = await tx.scheduledEvent.findUnique({ where: { id } });
      if (!old) return 'notFound';
      if (old.cancelledAt || old.endsAt.getTime() <= ctx.now().getTime()) return 'notActive';
      const updated = await tx.scheduledEvent.update({
        where: { id },
        data: { ...eventData(input), updatedAt: ctx.now() },
      });
      await audit(tx, {
        actor,
        action: 'event.update',
        details: { id, before: eventJson(old), after: eventJson(updated) },
      });
      return 'saved';
    });
  }

  return [
    {
      method: 'get',
      path: '/events',
      cap: 'events',
      handle: async (req, res) => {
        const now = ctx.now();
        const rows = await ctx.db.scheduledEvent.findMany({
          where: { endsAt: { gt: new Date(now.getTime() - LIST_DAYS * 86_400_000) } },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          take: 100,
        });
        const ids = [...new Set(rows.flatMap((row) => [row.createdBy, row.cancelledBy ?? '']))];
        const names = new Map(
          (
            await ctx.db.player.findMany({
              where: { steamId: { in: ids.filter(Boolean) } },
              select: { steamId: true, name: true },
            })
          ).map((row) => [row.steamId, displayName(row.name, row.steamId)]),
        );
        const state = (row: (typeof rows)[number]) =>
          row.cancelledAt
            ? 'cancelled'
            : row.endsAt.getTime() <= now.getTime()
              ? 'ended'
              : row.startsAt.getTime() <= now.getTime()
                ? 'active'
                : 'upcoming';
        const start = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
        renderAdmin(req, res, 'events', {
          current: 'events',
          rows: rows.map((row) => ({
            ...row,
            state: state(row),
            multiplier: row.xpMultiplier.toFixed(1),
            startsInput: utcToZonedInput(row.startsAt, tz()),
            endsInput: utcToZonedInput(row.endsAt, tz()),
            createdByName: names.get(row.createdBy) ?? row.createdBy,
          })),
          kinds: EVENT_KINDS,
          modes: DM_MODES,
          titleMax: EVENT_TITLE_MAX,
          timeZone: tz(),
          defaults: {
            startsInput: utcToZonedInput(start, tz()),
            endsInput: utcToZonedInput(new Date(start.getTime() + 2 * 3_600_000), tz()),
          },
        });
      },
    },
    {
      method: 'post',
      path: '/events',
      cap: 'events',
      handle: async (req, res) => {
        const input = eventFromForm(req.body, tz(), ctx.now());
        if (!input) return done(res, BACK, 'invalid');
        done(res, BACK, await save(input, me(res).steamId, null));
      },
    },
    {
      method: 'post',
      path: '/events/:id',
      cap: 'events',
      handle: async (req, res) => {
        const id = idParam.safeParse(req.params.id);
        const input = eventFromForm(req.body, tz(), ctx.now());
        if (!id.success || !input) return done(res, BACK, 'invalid');
        done(res, BACK, await save(input, me(res).steamId, id.data));
      },
    },
    {
      method: 'post',
      path: '/events/:id/cancel',
      cap: 'events',
      handle: async (req, res) => {
        const actor = me(res).steamId;
        const id = idParam.safeParse(req.params.id);
        if (!id.success) return done(res, BACK, 'invalid');
        const code = await write(async (tx) => {
          const old = await tx.scheduledEvent.findUnique({ where: { id: id.data } });
          if (!old) return 'notFound';
          if (old.cancelledAt || old.endsAt.getTime() <= ctx.now().getTime()) return 'notActive';
          await tx.scheduledEvent.update({
            where: { id: id.data },
            data: { cancelledAt: ctx.now(), cancelledBy: actor },
          });
          await audit(tx, {
            actor,
            action: 'event.cancel',
            details: { id: id.data, before: eventJson(old) },
          });
          return 'saved';
        });
        done(res, BACK, code);
      },
    },
  ];
}
