import { z } from 'zod';
import { audit } from '../audit.js';
import { commandErrorKey, type CommandResult } from '../commands.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { commandResultCode, first, type ResultCode } from '../forms.js';
import {
  CORE_PLUGINS,
  MAX_CONFIG_CHARS,
  PLUGIN_IDS,
  PLUGIN_OPS,
  pluginEntry,
  type PluginId,
  type PluginOp,
} from '../plugins-catalog.js';
import {
  catalogRows,
  configFingerprint,
  isJsonObject,
  parsePluginConfig,
  parsePluginList,
} from '../plugins-data.js';
import { done, renderAdmin, renderAdminError } from '../render.js';
import { failureDetail } from '../server-data.js';
import { RESTART_WAIT_MS } from './server.js';

/**
 * Плъгините от каталога (CONTRACT §14), всичко с право `plugins` (HEADADMIN+). Файловете ги мести root
 * през агента (`plugin` → `cs2-plugins@<op>-<id>`), живият ефект е през моста към нашия плъгин
 * (`plugins.load|unload`, `plugins.config.*`). Правото се проверява тук, ПРЕДИ подписа.
 * Конфигът никога не влиза в одита или логовете — само размер и sha256.
 */
const idParam = z.object({ id: z.enum(PLUGIN_IDS) });
const configBody = z.object({ text: z.preprocess(first, z.string().max(MAX_CONFIG_CHARS)) });

const listPath = '/admin/plugins';
const configPath = (id: PluginId) => `/admin/plugins/${id}/config`;

/** Откази от плъгина/агента → кратък ключ за одита (без свободен текст). */
const failure = (result: CommandResult) =>
  result.ok ? {} : { error: commandErrorKey(result.error) };

export function pluginRoutes(ctx: AdminCtx): AdminRoute[] {
  /**
   * Ред: `disable` = `plugins.unload` (най-добро усилие) → агентът; `enable` = агентът → `plugins.load`.
   * `enable`/`disable` чакат агента (само преместване, ≤ 25 s — nginx реже на 30 s); `install`/`remove`
   * са `--no-block` (сваляне, sha256, рестарт) → „пуснато“. Metamod плъгин или неуспешен жив ефект →
   * „записано, важи след рестарт“.
   */
  async function apply(op: PluginOp, id: PluginId, actor: string): Promise<ResultCode> {
    const live = pluginEntry(id).kind === 'css';
    const waits = op === 'enable' || op === 'disable';
    const unloaded =
      op === 'disable' && live ? (await ctx.bridge.send('plugins.unload', { id }, actor)).ok : true;
    const result = await ctx.agent.send(
      'plugin',
      { op, id },
      actor,
      waits ? { timeoutMs: RESTART_WAIT_MS } : {},
    );
    // Спрян на живо, а агентът отказа (зает, грешка) → файловете казват „работи“ — връщаме го веднага.
    // При таймаут не: агентът може още да мести файловете.
    if (op === 'disable' && live && !result.ok && result.error !== 'timeout') {
      await ctx.bridge.send('plugins.load', { id }, actor);
    }
    let code: ResultCode;
    if (!result.ok) {
      code =
        waits && result.error === 'timeout'
          ? 'cmdPending'
          : commandResultCode(commandErrorKey(result.error));
    } else if (!waits) {
      code = 'pluginQueued';
    } else if (!live) {
      code = 'pluginRestart';
    } else if (op === 'enable') {
      code = (await ctx.bridge.send('plugins.load', { id }, actor)).ok ? 'sent' : 'pluginRestart';
    } else {
      code = unloaded ? 'sent' : 'pluginRestart';
    }
    await audit(ctx.db, {
      actor,
      action: `plugin.${op}`,
      details: { id, ok: result.ok, ...failure(result) },
    });
    return code;
  }

  return [
    {
      method: 'get',
      path: '/plugins',
      cap: 'plugins',
      handle: async (req, res) => {
        const principal = me(res);
        const agent = await ctx.agent.send('plugins', {}, principal.steamId);
        const list = agent.ok ? parsePluginList(agent.data) : null;
        renderAdmin(req, res, 'plugins', {
          current: 'plugins',
          core: CORE_PLUGINS,
          rows: list?.rows ?? catalogRows(),
          busy: list?.busy ?? false,
          agentError: list ? null : agent.ok ? 'failed' : commandErrorKey(agent.error),
          agentDetail: agent.ok ? null : failureDetail(agent.data),
        });
      },
    },
    {
      method: 'get',
      path: '/plugins/:id/config',
      cap: 'plugins',
      handle: async (req, res) => {
        const params = idParam.safeParse(req.params);
        if (!params.success || !pluginEntry(params.data.id).config) {
          return renderAdminError(req, res, 'notFound');
        }
        const entry = pluginEntry(params.data.id);
        const got = await ctx.bridge.send('plugins.config.get', { id: entry.id }, me(res).steamId);
        const parsed = got.ok ? parsePluginConfig(got.data) : null;
        renderAdmin(req, res, 'plugin-config', {
          current: 'plugins',
          entry,
          maxChars: MAX_CONFIG_CHARS,
          config: parsed,
          error: parsed ? null : got.ok ? 'failed' : commandErrorKey(got.error),
        });
      },
    },
    {
      method: 'post',
      path: '/plugins/:id/config',
      cap: 'plugins',
      handle: async (req, res) => {
        const params = idParam.safeParse(req.params);
        if (!params.success || !pluginEntry(params.data.id).config) {
          return done(res, listPath, 'invalid');
        }
        const id = params.data.id;
        const body = configBody.safeParse(req.body);
        if (!body.success || !isJsonObject(body.data.text))
          return done(res, configPath(id), 'invalid');
        const actor = me(res).steamId;
        const text = body.data.text;
        const result = await ctx.bridge.send('plugins.config.set', { id, text }, actor);
        await audit(ctx.db, {
          actor,
          action: 'plugin.config',
          details: { id, ...configFingerprint(text), ok: result.ok, ...failure(result) },
        });
        done(
          res,
          configPath(id),
          result.ok ? 'sent' : commandResultCode(commandErrorKey(result.error)),
        );
      },
    },
    {
      method: 'post',
      path: '/plugins/:id/config/reset',
      cap: 'plugins',
      handle: async (req, res) => {
        const params = idParam.safeParse(req.params);
        if (!params.success || !pluginEntry(params.data.id).hasDefault) {
          return done(res, listPath, 'invalid');
        }
        const id = params.data.id;
        const actor = me(res).steamId;
        const result = await ctx.bridge.send('plugins.config.reset', { id }, actor);
        await audit(ctx.db, {
          actor,
          action: 'plugin.config_reset',
          details: { id, ok: result.ok, ...failure(result) },
        });
        done(
          res,
          configPath(id),
          result.ok ? 'sent' : commandResultCode(commandErrorKey(result.error)),
        );
      },
    },
    // Четири изрични пътя (не `/:op`) — така `/plugins/:id/config` никога не се бърка с действие.
    ...PLUGIN_OPS.map((op): AdminRoute => ({
      method: 'post',
      path: `/plugins/:id/${op}`,
      cap: 'plugins',
      handle: async (req, res) => {
        const params = idParam.safeParse(req.params);
        if (!params.success) return done(res, listPath, 'invalid');
        done(res, listPath, await apply(op, params.data.id, me(res).steamId));
      },
    })),
  ];
}
