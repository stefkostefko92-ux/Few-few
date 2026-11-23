import { Router } from 'express';
import { config } from '../config.js';
import { DAY } from '../time.js';
import { signupReport } from '../marketing/report.js';

/** Периодите на „Източници“ (SPEC 94) — дни назад; `vsichki` — без граница. */
const PERIODS = { '30': 30, '90': 90, '365': 365, vsichki: null } as const;
type Period = keyof typeof PERIODS;
const isPeriod = (value: unknown): value is Period =>
  typeof value === 'string' && Object.hasOwn(PERIODS, value);

/** „Източници“ в панела (под requireMaster — src/routes/admin.ts): откъде идват регистрациите. */
export function adminSourcesRouter(): Router {
  const router = Router();

  router.get('/admin/iztochnitsi', async (req, res) => {
    const period: Period = isPeriod(req.query['dni']) ? req.query['dni'] : '30';
    const days = PERIODS[period];
    const rows = await signupReport({
      since: days === null ? null : new Date(Date.now() - days * DAY),
    });
    const total = rows.reduce(
      (sum, row) => ({
        signups: sum.signups + row.companies + row.firms,
        paid: sum.paid + row.paid,
      }),
      { signups: 0, paid: 0 },
    );
    res.render('admin/sources', {
      rows,
      total,
      period,
      periods: Object.keys(PERIODS),
      example: `${config().PUBLIC_BASE_URL}/?utm_source=google&utm_medium=cpc&utm_campaign=start`,
    });
  });

  return router;
}
