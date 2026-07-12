import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, isDryRun } from './config.js';
import { csrfMiddleware } from './csrf.js';
import { router } from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  // Входът пази акаунт, който контролира рекламни бюджети → отделен, много по-строг лимит.
  app.use(
    '/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use((req, res, next) => {
    res.locals.dryRun = isDryRun();
    res.locals.env = config.env;
    next();
  });
  app.use(csrfMiddleware);
  app.use('/', router);

  app.use((req, res) =>
    res.status(404).render('error', { title: '404', message: 'Страницата не е намерена.' })
  );
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', {
      title: 'Грешка',
      message: config.env === 'production' ? 'Вътрешна грешка.' : String(err.message),
    });
  });

  return app;
}
