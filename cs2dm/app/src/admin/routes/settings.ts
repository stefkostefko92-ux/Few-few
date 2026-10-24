import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ADVERT_INTERVAL,
  ADVERT_LANGS,
  ADVERT_TEXT_MAX,
  BOT_QUOTA_MAX,
  BUILTIN_ADVERTS,
  MAX_CUSTOM_ADVERTS,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  XP_MULTIPLIER,
  isSettingKey,
  parseSetting,
  type SettingKey,
  type Settings,
} from '../../settings.js';
import { displayName } from '../../steamid.js';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { first } from '../forms.js';
import { done, renderAdmin } from '../render.js';
import { advertFieldName, canonicalJson, settingFromForm } from '../settings-form.js';

/**
 * Живите настройки (CONTRACT §11) — HEADADMIN+ ги вижда и сменя. Запис = транзакция (заключен ред →
 * запис → одит `settings.change` с before/after), после подписано `settings.reload` към плъгина.
 * Без отговор от плъгина записът остава (`recordedNoAck`) — плъгинът го взима сам до 60 s.
 * „По подразбиране“ трие реда: тогава важи конфигът на плъгина (/etc/cs2/cs2.env).
 */
const lockedRow = z.array(z.object({ value: z.unknown() }));

export interface SettingGroup<K extends SettingKey = SettingKey> {
  key: K;
  value: Settings[K];
  /** Има ред в базата (иначе важи конфигът на плъгина). */
  stored: boolean;
  /** Редът е повреден (писан не от нас) — плъгинът го пренебрегва. */
  invalid: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export async function readSettings(ctx: AdminCtx): Promise<SettingGroup[]> {
  const rows = await ctx.db.serverSetting.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    const parsed = row ? parseSetting(key, row.value) : null;
    return {
      key,
      value: parsed ?? SETTING_DEFAULTS[key],
      stored: row !== undefined,
      invalid: row !== undefined && parsed === null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export function settingsRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/settings',
      cap: 'settings',
      handle: async (req, res) => {
        const [groups, live] = await Promise.all([readSettings(ctx), ctx.live.snapshot()]);
        const ids = [...new Set(groups.flatMap((g) => (g.updatedBy ? [g.updatedBy] : [])))];
        const names = new Map(
          (
            await ctx.db.player.findMany({
              where: { steamId: { in: ids } },
              select: { steamId: true, name: true },
            })
          ).map((row) => [row.steamId, displayName(row.name, row.steamId)]),
        );
        renderAdmin(req, res, 'settings', {
          current: 'settings',
          groups: Object.fromEntries(groups.map((group) => [group.key, group])),
          order: SETTING_KEYS,
          names,
          pluginLive: live.status.known && live.status.online && live.status.source === 'plugin',
          limits: {
            interval: ADVERT_INTERVAL,
            advertMax: ADVERT_TEXT_MAX,
            customMax: MAX_CUSTOM_ADVERTS,
            botMax: BOT_QUOTA_MAX,
            xp: XP_MULTIPLIER,
          },
          builtin: BUILTIN_ADVERTS,
          langs: ADVERT_LANGS,
          advertFieldName,
        });
      },
    },
    {
      method: 'post',
      path: '/settings/:group',
      cap: 'settings',
      handle: async (req, res) => {
        const principal = me(res);
        const key = req.params.group;
        if (!isSettingKey(key)) return done(res, '/admin/settings', 'invalid');
        const body = (req.body ?? {}) as Record<string, unknown>;
        const reset = first(body.op) === 'reset';
        const after = reset ? null : settingFromForm(key, body);
        if (!reset && after === null) return done(res, '/admin/settings', 'invalid');
        await ctx.db.$transaction(async (tx) => {
          // Заключеният ред дава точното „преди“ за одита (играта пише в същата таблица).
          const raw = await tx.$queryRaw<unknown[]>`
            SELECT value FROM server_settings WHERE key = ${key} FOR UPDATE`;
          const before = lockedRow.parse(raw)[0]?.value ?? null;
          if (canonicalJson(before) === canonicalJson(after)) return;
          if (after === null) {
            await tx.serverSetting.delete({ where: { key } });
          } else {
            const value = after as Prisma.InputJsonObject;
            await tx.serverSetting.upsert({
              where: { key },
              create: { key, value, updatedBy: principal.steamId, updatedAt: ctx.now() },
              update: { value, updatedBy: principal.steamId, updatedAt: ctx.now() },
            });
          }
          await audit(tx, {
            actor: principal.steamId,
            action: 'settings.change',
            details: { key, before: before ?? null, after },
          });
        });
        // Записът е факт; командата само ускорява прилагането (иначе до 60 s).
        const result = await ctx.bridge.send('settings.reload', {}, principal.steamId);
        done(res, '/admin/settings', result.ok ? 'sent' : 'recordedNoAck');
      },
    },
  ];
}
