import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, isProduction, mailEnabled } from './config.js';
import { errorMessage, httpLogOptions, logger } from './logger.js';
import { ROOT } from './paths.js';
import { isPartial, renderError, SAFE_METHODS } from './auth/guards.js';
import { nomeRuolo, nomiDellaSessione, ruoliLocals } from './auth/nomi-ruoli.js';
import type { Capability } from './auth/roles.js';
import { canAnywhere, canIn } from './auth/scope.js';
import { attachSession } from './auth/sessions.js';
import { readFlash } from './http/flash.js';
import { writeLimiter } from './http/limits.js';
import { applyPrefs, attachPrefs, themeUrl } from './http/prefs.js';
import { PASSWORD_MIN_LENGTH } from './auth/password.js';
import { MAX_FILE_PER_VOLTA } from './allegati/caricamento.js';
import { primitiviFoglio } from './schizzi/forme.js';
import { VISTA_SCHIZZO } from './schizzi/model.js';
import { accountRouter } from './routes/account.js';
import { accountColoriRouter } from './routes/account-colori.js';
import { allegatiRouter } from './routes/allegati.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { aziendeRouter } from './routes/aziende.js';
import { cartelliNuovoRouter } from './routes/cartelli-nuovo.js';
import { calcoloArganoRouter } from './routes/calcolo-argano.js';
import { calcoloElencoRouter } from './routes/calcolo-argano-elenco.js';
import { calcoloLiberoRouter } from './routes/calcolo-argano-libero.js';
import { cartelliRouter } from './routes/cartelli.js';
import { cestinoRouter } from './routes/cestino.js';
import { ordiniRouter } from './routes/ordini.js';
import { healthRouter } from './routes/health.js';
import { impostazioniRouter } from './routes/impostazioni.js';
import { impostazioniCartelloRouter } from './routes/impostazioni-cartello.js';
import { impostazioniRuoliRouter } from './routes/impostazioni-ruoli.js';
import { interventiRouter } from './routes/interventi.js';
import { interventiFirmaRouter } from './routes/interventi-firma.js';
import { interventiInvioRouter } from './routes/interventi-invio.js';
import { requestsRouter } from './routes/requests.js';
import { schedeRouter } from './routes/schede.js';
import { schedeStampaRouter } from './routes/schede-stampa.js';
import { siteRouter } from './routes/site.js';
import { usersRouter } from './routes/users.js';
import { usersManageRouter } from './routes/users-manage.js';
import { countNewRequests } from './requests/service.js';
import { HOME_PATH } from './seo/paths.js';

/** Записът на картата: нова (`/schede`) и промяна (`/schede/<id>`). */
const FORMA_SCHEDA = /^\/schede(?:\/[a-z0-9]{20,40})?$/;

/** Кратък отпечатък на статичните файлове — сменя адреса на CSS/JS при всяка промяна (кешът е дълъг). */
function assetVersion(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(css|js|svg|woff2)$/.test(name)) hash.update(name).update(readFileSync(file));
    }
  };
  walk(join(ROOT, 'public'));
  return hash.digest('hex').slice(0, 10);
}

/** Грешките на body-parser носят статус; останалите (и не-Error) са 500. */
function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return 500;
}

/** Общото за шаблоните — от middleware-а и от страницата за грешка, паднала преди него. */
function baseLocals(req: Request, res: Response): void {
  const user = req.principal?.user ?? null;
  // `can` — поне в една фирма (менюто); `canIn` — във фирмата на конкретния запис (бутоните на картата).
  res.locals.can = (capability: Capability): boolean =>
    user ? canAnywhere(user, capability) : false;
  res.locals.canIn = (capability: Capability, aziendaId: string | null): boolean =>
    user ? canIn(user, capability, aziendaId) : false;
  res.locals.ruolo = nomeRuolo(res.locals.t, nomiDellaSessione(user));
  res.locals.mailEnabled = mailEnabled();
  const cfg = config();
  res.locals.limitiAllegati = {
    file: MAX_FILE_PER_VOLTA,
    foto: cfg.MEDIA_MAX_PHOTO_MB,
    video: cfg.MEDIA_MAX_VIDEO_MB,
    minuti: cfg.MEDIA_MAX_VIDEO_MIN,
  };
  res.locals.passwordMin = PASSWORD_MIN_LENGTH;
  res.locals.schizzoVista = VISTA_SCHIZZO;
  res.locals.schizzoForme = primitiviFoglio;
  res.locals.path = req.path;
  // Витрината — входът води към заявката за достъп.
  res.locals.landingPath = HOME_PATH;
  // Страница след POST (връзката на поканата) не се отваря пак с GET — там превключвател няма.
  res.locals.themeUrl = (value: string): string | null =>
    req.method === 'GET' || req.method === 'HEAD' ? themeUrl(req, value) : null;
}

/** Страница за грешка и когато заявката е паднала преди езика (твърде голямо тяло на формата). */
function failRequest(
  req: Request,
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  if (res.headersSent) return;
  if (!Object.hasOwn(res.locals, 't')) applyPrefs(res);
  if (!Object.hasOwn(res.locals, 'currentUser')) res.locals.currentUser = null;
  if (!Object.hasOwn(res.locals, 'flash')) res.locals.flash = null;
  if (!Object.hasOwn(res.locals, 'themeUrl')) baseLocals(req, res);
  renderError(res, status, titleKey, messageKey);
}

export function createServer(): Express {
  const cfg = config();
  const app = express();
  const version = assetVersion();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(ROOT, 'views'));

  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    res.locals.v = version;
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          styleSrcAttr: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          manifestSrc: ["'self'"],
          ...(isProduction() ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: isProduction() ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()',
    );
    next();
  });
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health' || (req.url ?? '').startsWith('/static/'),
      },
      ...httpLogOptions,
    }),
  );
  // Четири бележки по 4000 знака на кирилица са ~100 KB urlencoded, мерките на бутониерите — до 300
  // спирки (измерено: формата праща ~1950 параметъра с 300 спирки), отметките на снимките за печата —
  // до 300 (`MAX_PER_SCHEDA`). Таванът е над това, не повече. Само формата на картата носи и листовете
  // на скицника (до MAX_FOGLI по MAX_FOGLIO_CODIFICATO, src/schizzi/model.ts — 3,5 MB): тялото ѝ се
  // чете след сесията, до 4 MB само за влязъл човек (по-долу).
  const forma = (limit: string) =>
    express.urlencoded({ extended: false, limit, parameterLimit: 3000 });
  const formaComune = forma('1mb');
  const formaScheda = forma('4mb');
  app.use((req, res, next) => {
    if (req.method === 'POST' && FORMA_SCHEDA.test(req.path)) next();
    else formaComune(req, res, next);
  });
  app.use(cookieParser());
  app.use(
    '/static',
    express.static(join(ROOT, 'public'), {
      maxAge: isProduction() ? '30d' : 0,
      immutable: isProduction(),
      setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
    }),
  );
  app.use(healthRouter);

  // Всичко отвъд статиката: сесия → речник и тема → еднократно съобщение → общото за шаблоните.
  app.use(attachSession);
  // Записът на картата: до 4 MB само за влязъл човек (листовете на скицника), иначе — до 1 MB.
  app.use((req, res, next) => {
    if (req.method !== 'POST' || !FORMA_SCHEDA.test(req.path)) return next();
    (req.principal ? formaScheda : formaComune)(req, res, next);
  });
  app.use(attachPrefs);
  app.use(readFlash);
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Данните са на поканени хора — нито браузърът, нито прокси пазят страниците.
    res.set('Cache-Control', 'no-store');
    baseLocals(req, res);
    next();
  });
  // Имената на ролите, както ги е записала всяка фирма (`ruolo(роля, фирма)` в изгледите).
  app.use(ruoliLocals);
  // Броят на новите заявки за достъп до „Richieste“ — само за MASTER и само на цяла страница.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    res.locals.newRequests = 0;
    const user = req.principal?.user;
    if (
      user &&
      canAnywhere(user, 'requests:manage') &&
      SAFE_METHODS.has(req.method) &&
      !isPartial(req)
    ) {
      try {
        res.locals.newRequests = await countNewRequests();
      } catch (error) {
        logger.warn({ err: errorMessage(error) }, 'броят на заявките не се прочете');
      }
    }
    next();
  });
  app.use(writeLimiter);
  app.use(siteRouter);
  app.use(authRouter);
  app.use(accountRouter);
  app.use(accountColoriRouter);
  app.use(schedeRouter);
  app.use(schedeStampaRouter);
  app.use(allegatiRouter);
  app.use(cestinoRouter);
  app.use(ordiniRouter);
  app.use(calcoloArganoRouter);
  app.use(calcoloElencoRouter);
  app.use(calcoloLiberoRouter);
  app.use(interventiRouter);
  app.use(interventiFirmaRouter);
  app.use(interventiInvioRouter);
  app.use(impostazioniCartelloRouter);
  // Преди cartelliRouter: `/cartelli/nuovo` е преди `/cartelli/:id`.
  app.use(cartelliNuovoRouter);
  app.use(cartelliRouter);
  app.use(usersRouter);
  // След usersRouter: `/utenti/invita` е преди `/utenti/:id`.
  app.use(usersManageRouter);
  app.use(aziendeRouter);
  app.use(impostazioniRouter);
  app.use(impostazioniRuoliRouter);
  app.use(requestsRouter);
  app.use(auditRouter);

  app.use((req: Request, res: Response) => {
    failRequest(req, res, 404, 'error.notFoundTitle', 'error.notFound');
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Грешка на заявката (твърде голямо тяло, счупено кодиране) остава 4xx и не е тревога: без стек.
    const status = errorStatus(error);
    if (status >= 400 && status < 500) {
      logger.warn({ status, path: req.path }, 'отказана заявка');
      failRequest(
        req,
        res,
        status,
        'error.title',
        status === 413 ? 'error.tooLarge' : 'error.badInput',
      );
      return;
    }
    logger.error(
      {
        err: errorMessage(error),
        stack:
          error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
        path: req.path,
      },
      'необработена грешка',
    );
    failRequest(req, res, 500, 'error.internalTitle', 'error.internal');
  });

  return app;
}
