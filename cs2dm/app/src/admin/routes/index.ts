import type { AdminCtx, AdminRoute } from '../context.js';
import { caseRoutes } from './cases.js';
import { dashboardRoutes } from './dashboard.js';
import { eventRoutes } from './events.js';
import { playerActionRoutes } from './player-actions.js';
import { playerDataRoutes } from './player-data.js';
import { playerRoutes } from './players.js';
import { pluginRoutes } from './plugins.js';
import { punishmentRoutes } from './punishments.js';
import { recordRoutes } from './records.js';
import { serverRoutes } from './server.js';
import { settingsRoutes } from './settings.js';
import { statsRoutes } from './stats.js';
import { accountRoutes } from './totp.js';
import { vipRoutes } from './vip.js';

/** Всички защитени маршрути на панела — с възможност на всеки (тестът обхожда точно този списък). */
export function protectedRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    ...dashboardRoutes(ctx),
    ...punishmentRoutes(ctx),
    ...playerRoutes(ctx),
    ...playerActionRoutes(ctx),
    ...statsRoutes(ctx),
    ...playerDataRoutes(ctx),
    ...caseRoutes(ctx),
    ...vipRoutes(ctx),
    ...eventRoutes(ctx),
    ...recordRoutes(ctx),
    ...serverRoutes(ctx),
    ...pluginRoutes(ctx),
    ...settingsRoutes(ctx),
    ...accountRoutes(ctx),
  ];
}
