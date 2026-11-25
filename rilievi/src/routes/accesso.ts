import { Router } from 'express';
import { accessoEsternoRouter } from './accesso-esterno.js';
import { account2faRouter } from './account-2fa.js';
import { accountColoriRouter } from './account-colori.js';
import { accountRouter } from './account.js';
import { authCodiceRouter } from './auth-codice.js';
import { authRouter } from './auth.js';
import { calcoloElencoRouter } from './calcolo-argano-elenco.js';
import { calcoloLiberoRouter } from './calcolo-argano-libero.js';
import { calcoloArganoRouter } from './calcolo-argano.js';
import { limitatoreElencoRouter } from './calcolo-limitatore-elenco.js';
import { limitatoreLiberoRouter } from './calcolo-limitatore-libero.js';
import { calcoloLimitatoreRouter } from './calcolo-limitatore.js';

/**
 * Групите рутери, които server.ts закача на едно място (в този ред): входът (доставчикът на самоличност,
 * паролата, кодът на 2FA, поканите, новата парола) и профилът; изчисленията за аргано и за ограничителя (на картата, страницата в
 * менюто, без карта — `/calcolo-…/nuovo` преди `/calcolo-…/:id`).
 */
export const accessoRouter: Router = Router();
accessoRouter.use(
  // Първо: бутоните на доставчиците на самоличност влизат в `res.locals` на страницата за вход.
  accessoEsternoRouter,
  authRouter,
  authCodiceRouter,
  accountRouter,
  accountColoriRouter,
  account2faRouter,
);

export const calcoloRouter: Router = Router();
calcoloRouter.use(
  calcoloArganoRouter,
  calcoloElencoRouter,
  calcoloLiberoRouter,
  calcoloLimitatoreRouter,
  limitatoreElencoRouter,
  limitatoreLiberoRouter,
);
