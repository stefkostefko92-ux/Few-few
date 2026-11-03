// Страниците на дашборда: партиди и видове, правила за известия, настройки. Всяка POST форма води
// обратно към страницата си с флаш съобщение (Post/Redirect/Get).
import { Router as createRouter, type Request, type Response, type Router } from 'express';
import type { ZodType } from 'zod';
import { formatThreshold } from '../domain/messages.js';
import {
  batchCreateSchema,
  batchEditSchema,
  idParamSchema,
  parseDecimal,
  ruleSchema,
  seedKeySchema,
  seedTypeSchema,
  settingsSchema,
} from '../domain/validation.js';
import {
  createBatch,
  deleteBatch,
  deleteExpiredBatches,
  listBatches,
  listSeedTypes,
  updateBatch,
  updateSeedTypeRate,
} from '../services/batches.js';
import {
  createRule,
  deleteRule,
  getRule,
  listRules,
  updateRule,
  updateSettings,
} from '../services/rules.js';
import type { AuthKit } from './auth.js';
import { getContext, type WebKit } from './context.js';
import { batchRows, ruleViews, seedTypeViews } from './viewmodels.js';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

export function createPages(kit: WebKit, auth: AuthKit): Router {
  const { deps } = kit;
  const db = deps.db;
  const router = createRouter();
  router.use(auth.requireUser);

  // Невалиден вход → флаш с първата грешка и обратно; валиден → данните.
  function parse<T>(schema: ZodType<T>, input: unknown, res: Response, back: string): T | null {
    const r = schema.safeParse(input);
    if (r.success) return r.data;
    kit.flash(res, 'err', r.error.issues[0]?.message ?? 'Невалидни данни');
    res.redirect(303, back);
    return null;
  }

  function idOf(req: Request): number | null {
    const r = idParamSchema.safeParse(req.params.id);
    return r.success ? r.data : null;
  }

  function done(
    res: Response,
    back: string,
    ok: boolean,
    okText: string,
    errText = 'Няма такъв запис.',
  ) {
    kit.flash(res, ok ? 'ok' : 'err', ok ? okText : errText);
    res.redirect(303, back);
  }

  // ── Партиди и видове ──
  router.get('/', async (req, res) => {
    const { settings } = getContext(req);
    const [types, batches] = await Promise.all([listSeedTypes(db), listBatches(db)]);
    kit.render(req, res, 'batches', {
      title: 'Семки',
      active: 'batches',
      rows: batchRows(batches, types, kit.now(), settings.timezone),
      types: seedTypeViews(types, batches),
      timezone: settings.timezone,
    });
  });

  router.post('/batches', async (req, res) => {
    const input = parse(batchCreateSchema, req.body, res, '/');
    if (!input) return;
    const { user } = getContext(req);
    const { batch, passed } = await createBatch(
      db,
      input,
      { id: user.sub, name: user.name },
      'dashboard',
      kit.now(),
    );
    const note = passed.length
      ? ` Вече е под ${[...new Set(passed.map((r) => formatThreshold(r.kind, r.threshold)))].join(', ')} — без пинг за тях.`
      : '';
    done(res, '/', true, `Добавена партида #${batch.id}.${note}`);
  });

  router.post('/batches/delete-expired', async (_req, res) => {
    const n = await deleteExpiredBatches(db, kit.now());
    done(res, '/', true, n ? `Изтрити изтекли партиди: ${n}.` : 'Няма изтекли партиди.');
  });

  router.post('/batches/:id', async (req, res) => {
    const id = idOf(req);
    const input = parse(batchEditSchema, req.body, res, '/');
    if (!input) return;
    // Процентът е сменен само ако се различава от показания при зареждането на страницата.
    const body: unknown = req.body;
    const shownRaw =
      typeof body === 'object' && body !== null && 'percentShown' in body
        ? body.percentShown
        : undefined;
    const shown = typeof shownRaw === 'string' ? parseDecimal(shownRaw) : Number.NaN;
    const percentChanged =
      !Number.isFinite(shown) || Math.round(shown * 100) !== Math.round(input.percent * 100);
    done(
      res,
      '/',
      id !== null &&
        (await updateBatch(
          db,
          id,
          { count: input.count, percent: percentChanged ? input.percent : null },
          kit.now(),
        )),
      `Партида #${id} е обновена.`,
    );
  });

  router.post('/batches/:id/delete', async (req, res) => {
    const id = idOf(req);
    done(
      res,
      '/',
      id !== null && (await deleteBatch(db, id)) !== null,
      `Партида #${id} е изтрита.`,
    );
  });

  router.post('/types/:key', async (req, res) => {
    const key = seedKeySchema.safeParse(req.params.key);
    const input = parse(seedTypeSchema, req.body, res, '/');
    if (!input) return;
    const ok = key.success && (await updateSeedTypeRate(db, key.data, input, kit.now()));
    done(res, '/', ok, 'Скоростта е сменена — важи от сега, текущите проценти са запазени.');
  });

  // ── Правила за известия ──
  router.get('/alerts', async (req, res) => {
    const [types, rules] = await Promise.all([listSeedTypes(db), listRules(db)]);
    const channels = deps.guild.channels();
    const roles = deps.guild.roles();
    kit.render(req, res, 'alerts', {
      title: 'Известия',
      active: 'alerts',
      rules: ruleViews(rules, types, channels, roles),
      types,
      channels,
      roles,
    });
  });

  // Канал и роля — само от гилдията, не произволни ID-та.
  function knownTarget(channelId: string, roleId: string): string | null {
    if (!deps.guild.channels().some((c) => c.id === channelId))
      return 'Избери текстов канал от сървъра.';
    if (!deps.guild.roles().some((r) => r.id === roleId)) return 'Избери роля от сървъра.';
    return null;
  }

  router.post('/alerts', async (req, res) => {
    const input = parse(ruleSchema, req.body, res, '/alerts');
    if (!input) return;
    const bad = knownTarget(input.channelId, input.roleId);
    if (bad) return done(res, '/alerts', false, '', bad);
    await createRule(db, input, kit.now());
    done(
      res,
      '/alerts',
      true,
      'Правилото е добавено. Партидите, които вече са под прага, няма да бъдат пингнати.',
    );
  });

  router.post('/alerts/:id', async (req, res) => {
    const id = idOf(req);
    const input = parse(ruleSchema, req.body, res, '/alerts');
    if (!input) return;
    const bad = knownTarget(input.channelId, input.roleId);
    if (bad) return done(res, '/alerts', false, '', bad);
    done(
      res,
      '/alerts',
      id !== null && (await updateRule(db, id, input, kit.now())),
      'Правилото е обновено.',
    );
  });

  router.post('/alerts/:id/delete', async (req, res) => {
    const id = idOf(req);
    done(res, '/alerts', id !== null && (await deleteRule(db, id)), 'Правилото е изтрито.');
  });

  // Пробно съобщение в канала на правилото — проверява правата на бота, без да тагва ролята.
  router.post('/alerts/:id/test', async (req, res) => {
    const id = idOf(req);
    const rule = id === null ? null : await getRule(db, id);
    if (!rule) return done(res, '/alerts', false, '');
    try {
      await deps.sender.send(
        rule.channelId,
        rule.roleId,
        `Пробно известие от Semki Bot: при праг ${formatThreshold(rule.kind, rule.threshold)} тук ще бъде тагната <@&${rule.roleId}>.`,
        false,
      );
      done(res, '/alerts', true, 'Пробното съобщение е изпратено.');
    } catch (err) {
      deps.log.warn({ err, ruleId: rule.id }, 'пробното известие не мина');
      done(
        res,
        '/alerts',
        false,
        '',
        'Ботът не можа да пише в канала — провери правата му (View Channel, Send Messages, Mention roles).',
      );
    }
  });

  // ── Настройки ──
  router.get('/settings', (req, res) => {
    const { settings } = getContext(req);
    kit.render(req, res, 'settings', {
      title: 'Настройки',
      active: 'settings',
      settings,
      roles: deps.guild.roles(),
      timezones: TIMEZONES,
    });
  });

  router.post('/settings', async (req, res) => {
    const input = parse(settingsSchema, req.body, res, '/settings');
    if (!input) return;
    const roles = deps.guild.roles();
    for (const roleId of [input.dashboardRoleId, input.commandRoleId]) {
      if (roleId && !roles.some((r) => r.id === roleId)) {
        return done(res, '/settings', false, '', 'Избери роля от сървъра.');
      }
    }
    await updateSettings(db, input);
    auth.forgetMember();
    done(res, '/settings', true, 'Настройките са запазени.');
  });

  return router;
}
