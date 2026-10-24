import { z } from 'zod';
import { pagesFor } from '../../data/repo.js';
import { displayName } from '../../steamid.js';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { first, optionalString, pageParam, requiredInt, requiredString } from '../forms.js';
import { AppealAlreadyDecided, revokePunishment } from '../punish.js';
import { can } from '../rbac.js';
import { done, renderAdmin } from '../render.js';

/**
 * Доклади от играта (`!report`) и обжалвания (формата за играчите е извън етап 2 — тук само
 * преглед и решение). Решението е еднократно: само ред в статус OPEN се решава.
 */
const PAGE_SIZE = 50;
const STATUSES = ['OPEN', 'ACCEPTED', 'REJECTED'] as const;
const DECISIONS = ['ACCEPTED', 'REJECTED'] as const;

const listQuery = z.object({
  status: z.preprocess(first, z.enum(STATUSES)).catch('OPEN'),
  page: pageParam,
});
const reportBody = z.object({
  status: z.preprocess(first, z.enum(DECISIONS)),
  note: optionalString(500),
});
const appealBody = z.object({
  status: z.preprocess(first, z.enum(DECISIONS)),
  note: requiredString(1000),
});
const idParam = requiredInt(1, 2_147_483_647);

export function caseRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/reports',
      cap: 'panel',
      handle: async (req, res) => {
        const query = listQuery.parse(req.query);
        const where = { status: query.status };
        const [rows, total] = await Promise.all([
          ctx.db.report.findMany({
            where,
            orderBy: [{ createdAt: query.status === 'OPEN' ? 'asc' : 'desc' }, { id: 'asc' }],
            skip: (query.page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          }),
          ctx.db.report.count({ where }),
        ]);
        renderAdmin(req, res, 'reports', {
          current: 'reports',
          query,
          statuses: STATUSES,
          rows: rows.map((row) => ({
            ...row,
            targetName: displayName(row.targetName, row.targetSteamId),
          })),
          total,
          page: query.page,
          pages: pagesFor(total, PAGE_SIZE),
          canHandle: can(me(res).role, 'reportsHandle'),
        });
      },
    },
    {
      method: 'post',
      path: '/reports/:id',
      cap: 'reportsHandle',
      handle: async (req, res) => {
        const principal = me(res);
        const id = idParam.safeParse(req.params.id);
        const body = reportBody.safeParse(req.body);
        if (!id.success || !body.success) return done(res, '/admin/reports', 'invalid');
        const handled = await ctx.db.$transaction(async (tx) => {
          const report = await tx.report.findUnique({
            where: { id: id.data },
            select: { targetSteamId: true },
          });
          const updated = await tx.report.updateMany({
            where: { id: id.data, status: 'OPEN' },
            data: {
              status: body.data.status,
              handledAt: ctx.now(),
              handledBy: principal.steamId,
              note: body.data.note ?? null,
            },
          });
          if (updated.count !== 1 || !report) return false;
          await audit(tx, {
            actor: principal.steamId,
            action: 'report.resolve',
            target: report.targetSteamId,
            details: { reportId: id.data, status: body.data.status },
          });
          return true;
        });
        done(res, '/admin/reports', handled ? 'saved' : 'notActive');
      },
    },
    {
      method: 'get',
      path: '/appeals',
      cap: 'appeals',
      handle: async (req, res) => {
        const query = listQuery.parse(req.query);
        const where = { status: query.status };
        const now = ctx.now();
        const [rows, total] = await Promise.all([
          ctx.db.appeal.findMany({
            where,
            orderBy: [{ createdAt: query.status === 'OPEN' ? 'asc' : 'desc' }, { id: 'asc' }],
            skip: (query.page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: { punishment: true },
          }),
          ctx.db.appeal.count({ where }),
        ]);
        renderAdmin(req, res, 'appeals', {
          current: 'appeals',
          query,
          statuses: STATUSES,
          rows: rows.map((row) => ({
            ...row,
            punishment: {
              ...row.punishment,
              targetName: displayName(row.punishment.targetName, row.punishment.steamId),
              active:
                row.punishment.revokedAt === null &&
                (row.punishment.expiresAt === null ||
                  row.punishment.expiresAt.getTime() > now.getTime()),
            },
          })),
          total,
          page: query.page,
          pages: pagesFor(total, PAGE_SIZE),
        });
      },
    },
    {
      method: 'post',
      path: '/appeals/:id',
      cap: 'appeals',
      handle: async (req, res) => {
        const principal = me(res);
        const id = idParam.safeParse(req.params.id);
        const body = appealBody.safeParse(req.body);
        if (!id.success || !body.success) return done(res, '/admin/appeals', 'invalid');
        const appeal = await ctx.db.appeal.findUnique({
          where: { id: id.data },
          select: {
            status: true,
            steamId: true,
            punishmentId: true,
            punishment: { select: { revokedAt: true, expiresAt: true } },
          },
        });
        if (!appeal) return done(res, '/admin/appeals', 'notFound');
        if (appeal.status !== 'OPEN') return done(res, '/admin/appeals', 'notActive');
        const now = ctx.now();
        const stillActive =
          appeal.punishment.revokedAt === null &&
          (appeal.punishment.expiresAt === null ||
            appeal.punishment.expiresAt.getTime() > now.getTime());

        // Уважено обжалване на активно наказание = отмяна: нужни са правата за отмяна на този вид
        // и immunity спрямо наказания — иначе решава по-висок админ.
        if (body.data.status === 'ACCEPTED' && stillActive) {
          try {
            const code = await revokePunishment(
              ctx,
              principal,
              appeal.punishmentId,
              body.data.note,
              { appealId: id.data, note: body.data.note, status: 'ACCEPTED' },
            );
            return done(res, '/admin/appeals', code);
          } catch (error) {
            if (error instanceof AppealAlreadyDecided)
              return done(res, '/admin/appeals', 'notActive');
            throw error;
          }
        }
        const decided = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.appeal.updateMany({
            where: { id: id.data, status: 'OPEN' },
            data: {
              status: body.data.status,
              handledAt: now,
              handledBy: principal.steamId,
              decisionNote: body.data.note,
            },
          });
          if (updated.count !== 1) return false;
          await audit(tx, {
            actor: principal.steamId,
            action: 'appeal.decide',
            target: appeal.steamId,
            details: {
              appealId: id.data,
              status: body.data.status,
              punishmentId: appeal.punishmentId,
            },
          });
          return true;
        });
        done(res, '/admin/appeals', decided ? 'saved' : 'notActive');
      },
    },
  ];
}
