import type { AdminCtx, AdminRoute } from '../context.js';
import { caseRoutes } from './cases.js';
import { dashboardRoutes } from './dashboard.js';
import { playerActionRoutes } from './player-actions.js';
import { playerRoutes } from './players.js';
import { punishmentRoutes } from './punishments.js';
import { recordRoutes } from './records.js';
import { serverRoutes } from './server.js';
import { accountRoutes } from './totp.js';
import { vipRoutes } from './vip.js';

/** Всички защитени маршрути на панела — с възможност на всеки (тестът обхожда точно този списък). */
export function protectedRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    ...dashboardRoutes(ctx),
    ...punishmentRoutes(ctx),
    ...playerRoutes(ctx),
    ...playerActionRoutes(ctx),
    ...caseRoutes(ctx),
    ...vipRoutes(ctx),
    ...recordRoutes(ctx),
    ...serverRoutes(ctx),
    ...accountRoutes(ctx),
  ];
}
