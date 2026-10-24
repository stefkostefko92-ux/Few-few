import type { Prisma } from '@prisma/client';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { requiredInt, type ResultCode } from '../forms.js';
import { done } from '../render.js';
import {
  SEASON_INT_FIELDS,
  STAT_MAX,
  WEAPON_MAX,
  XP_MAX,
  ZERO_SEASON,
  bumpEpoch,
  changes,
  playtimeForm,
  resetForm,
  seasonRowJson,
  seasonStatsForm,
  weaponForm,
} from '../stats-edit.js';
import { failurePath, findTarget, profilePath } from '../target.js';

/**
 * Редакцията на статистиките на играч (HEADADMIN+, `playerData`; immunity — само под себе си).
 * Всяка промяна: заключен играч → нова епоха (§3) → запис → одит с before/after → `player.reload`
 * към плъгина, за да вземе стойностите от базата. Без промяна — нищо (транзакцията се връща назад,
 * за да не изгубим натрупаното в плъгина с излишна епоха).
 */
const seasonParam = requiredInt(0, 1_000_000);

/** Отказ вътре в транзакцията: връща всичко назад (и епохата) и казва кода на резултата. */
class Rollback extends Error {
  constructor(readonly code: ResultCode) {
    super('връщане назад');
  }
}

/** Работата в транзакцията: null = записано; код = нищо не се записва (вкл. „без промяна“ = saved). */
type Work = (
  tx: Prisma.TransactionClient,
  steamId: string,
  actor: string,
) => Promise<ResultCode | null>;
type Prepare = (req: Parameters<AdminRoute['handle']>[0]) => Work | ResultCode;

export function statsRoutes(ctx: AdminCtx): AdminRoute[] {
  /** Обща рамка: цел + immunity → транзакция с нова епоха → одит → `player.reload` към плъгина. */
  function action(path: string, prepare: Prepare): AdminRoute {
    return {
      method: 'post',
      path,
      cap: 'playerData',
      handle: async (req, res) => {
        const principal = me(res);
        const found = await findTarget(ctx, req, principal.role);
        if (!found.ok) return done(res, failurePath(found), found.code);
        const profile = profilePath(found.steamId);
        const work = prepare(req);
        if (typeof work === 'string') return done(res, profile, work);
        try {
          await ctx.db.$transaction(async (tx) => {
            if ((await bumpEpoch(tx, found.steamId)) === null) throw new Rollback('notFound');
            const result = await work(tx, found.steamId, principal.steamId);
            if (result !== null) throw new Rollback(result);
          });
        } catch (error) {
          if (error instanceof Rollback) return done(res, profile, error.code);
          throw error;
        }
        const ack = await ctx.bridge.send(
          'player.reload',
          { steamId: found.steamId },
          principal.steamId,
        );
        done(res, profile, ack.ok ? 'sent' : 'recordedNoAck');
      },
    };
  }

  return [
    action('/players/:steamId/stats/:seasonId', (req) => {
      const seasonId = seasonParam.safeParse(req.params.seasonId);
      const body = seasonStatsForm.safeParse(req.body);
      if (!seasonId.success || !body.success) return 'invalid';
      return async (tx, steamId, actor) => {
        const where = { steamId_seasonId: { steamId, seasonId: seasonId.data } };
        const row = await tx.playerSeasonStats.findUnique({ where });
        if (!row) return 'notFound';
        const diff = changes(row, body.data);
        if (!diff) return 'saved';
        const epoch = row.statsEpoch;
        await tx.playerSeasonStats.update({ where, data: { ...body.data, updatedAt: ctx.now() } });
        await audit(tx, {
          actor,
          action: 'stats.edit',
          target: steamId,
          details: { seasonId: seasonId.data, epoch, ...diff },
        });
        return null;
      };
    }),
    action('/players/:steamId/weapons/:seasonId', (req) => {
      const seasonId = seasonParam.safeParse(req.params.seasonId);
      const body = weaponForm.safeParse(req.body);
      if (!seasonId.success || !body.success) return 'invalid';
      return async (tx, steamId, actor) => {
        const { weapon, kills, headshots } = body.data;
        const where = { steamId_seasonId_weapon: { steamId, seasonId: seasonId.data, weapon } };
        const row = await tx.weaponSeasonStats.findUnique({ where });
        if (!row) return 'notFound';
        const diff = changes(row, { kills, headshots });
        if (!diff) return 'saved';
        await tx.weaponSeasonStats.update({ where, data: { kills, headshots } });
        await audit(tx, {
          actor,
          action: 'stats.weapon',
          target: steamId,
          details: { seasonId: seasonId.data, weapon, epoch: row.statsEpoch, ...diff },
        });
        return null;
      };
    }),
    action('/players/:steamId/playtime', (req) => {
      const body = playtimeForm.safeParse(req.body);
      if (!body.success) return 'invalid';
      return async (tx, steamId, actor) => {
        const row = await tx.player.findUniqueOrThrow({
          where: { steamId },
          select: { playtimeSec: true, statsEpoch: true },
        });
        const diff = changes(row, body.data);
        if (!diff) return 'saved';
        await tx.player.update({ where: { steamId }, data: body.data });
        await audit(tx, {
          actor,
          action: 'stats.playtime',
          target: steamId,
          details: { epoch: row.statsEpoch, ...diff },
        });
        return null;
      };
    }),
    action('/players/:steamId/stats-reset', (req) => {
      const body = resetForm.safeParse(req.body);
      if (!body.success) return 'invalid';
      return async (tx, steamId, actor) => {
        const season = await tx.season.findFirst({
          where: { id: { gt: 0 }, endsAt: null },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        if (body.data.scope === 'season' && !season) return 'invalid';
        const seasonFilter = body.data.scope === 'season' ? { seasonId: season!.id } : {};
        const rows = await tx.playerSeasonStats.findMany({
          where: { steamId, ...seasonFilter },
          orderBy: { seasonId: 'asc' },
        });
        const weapons = await tx.weaponSeasonStats.findMany({
          where: { steamId, ...seasonFilter, kills: { gt: 0 } },
          select: { seasonId: true, weapon: true, kills: true, headshots: true },
        });
        const player = await tx.player.findUniqueOrThrow({
          where: { steamId },
          select: { playtimeSec: true },
        });
        const all = body.data.scope === 'all';
        const nothing = rows.every((row) => changes(row, ZERO_SEASON) === null);
        if (nothing && weapons.length === 0 && (!all || player.playtimeSec === 0)) return 'saved';
        await tx.playerSeasonStats.updateMany({
          where: { steamId, ...seasonFilter },
          data: { ...ZERO_SEASON, updatedAt: ctx.now() },
        });
        await tx.weaponSeasonStats.updateMany({
          where: { steamId, ...seasonFilter },
          data: { kills: 0, headshots: 0 },
        });
        if (all) await tx.player.update({ where: { steamId }, data: { playtimeSec: 0 } });
        await audit(tx, {
          actor,
          action: 'stats.reset',
          target: steamId,
          details: {
            scope: body.data.scope,
            before: {
              seasons: rows.map(seasonRowJson),
              weapons,
              ...(all ? { playtimeSec: player.playtimeSec } : {}),
            },
            after: { fields: [...SEASON_INT_FIELDS, 'xp'], value: 0 },
          },
        });
        return null;
      };
    }),
  ];
}

/** Данните за редактора в профила: всички сезонни редове, оръжията по сезон, текущият сезон. */
export async function statsEditorData(ctx: AdminCtx, steamId: string) {
  const [rows, weapons, current, player] = await Promise.all([
    ctx.db.playerSeasonStats.findMany({ where: { steamId }, orderBy: { seasonId: 'asc' } }),
    ctx.db.weaponSeasonStats.findMany({
      where: { steamId },
      orderBy: [{ seasonId: 'asc' }, { kills: 'desc' }, { weapon: 'asc' }],
    }),
    ctx.db.season.findFirst({
      where: { id: { gt: 0 }, endsAt: null },
      orderBy: { id: 'desc' },
      select: { id: true },
    }),
    ctx.db.player.findUniqueOrThrow({
      where: { steamId },
      select: { playtimeSec: true, statsEpoch: true },
    }),
  ]);
  return {
    fields: SEASON_INT_FIELDS,
    limits: { ...STAT_MAX, xp: XP_MAX.toString(), weapon: WEAPON_MAX },
    seasons: rows.map((row) => ({
      ...row,
      xp: row.xp.toString(),
      weapons: weapons.filter((weapon) => weapon.seasonId === row.seasonId),
    })),
    currentSeasonId: current?.id ?? null,
    playtimeSec: player.playtimeSec,
    epoch: player.statsEpoch,
  };
}
