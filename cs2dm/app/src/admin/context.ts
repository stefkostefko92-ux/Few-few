import type { PrismaClient } from '@prisma/client';
import type { Request, RequestHandler, Response } from 'express';
import type { AdminLiveSource } from '../live.js';
import type { CommandSender } from './commands.js';
import type { Capability } from './rbac.js';
import type { FetchLike } from './steam-openid.js';
import type { AdminPrincipal } from './types.js';
import type { PerfSource } from './perf.js';

/** Общото за маршрутите на панела — сглобява се веднъж в `admin/index.ts`. */
export interface AdminCtx {
  db: PrismaClient;
  live: AdminLiveSource;
  bridge: CommandSender;
  agent: CommandSender;
  perf: PerfSource;
  /** 32 байта от APP_ENC_KEY — без него панелът изобщо не се сглобява (503). */
  encKey: Buffer;
  steamFetch: FetchLike;
  now: () => Date;
}

/**
 * Защитен маршрут: възможността е ЗАДЪЛЖИТЕЛНА в типа — няма как да се добави маршрут без право.
 * Композиторът слага пред всеки `requireCap(cap)` и CSRF проверката (за POST); по-фините проверки
 * (вид и срок на наказание, immunity, роли) са в самия обработчик, преди писане или подпис.
 */
export interface AdminRoute {
  method: 'get' | 'post';
  path: string;
  cap: Capability;
  /** Допълнителни слоеве преди обработчика (например по-строг лимит). */
  before?: RequestHandler[];
  handle: (req: Request, res: Response) => Promise<void>;
}

/** Вписаният човек — маршрутите тичат само след `requireCap`, значи го има. */
export function me(res: Response): AdminPrincipal {
  const principal = res.locals.admin;
  if (!principal) throw new Error('панел: маршрут без вписан човек (липсва requireCap)');
  return principal;
}
