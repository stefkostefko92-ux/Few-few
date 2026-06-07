import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { MulterError } from 'multer';
import { pinoHttp } from 'pino-http';

import { env } from './env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { reportsRouter } from './reports/router.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger }));

  // CORS whitelist — никога „*" на production.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && env.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/reports', reportsRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Не е намерено.' });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Файлът е твърде голям.'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Прикачи най-много 3 файла.'
            : 'Проблем с прикачения файл.';
      res.status(400).json({ error: message });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'Възникна грешка на сървъра.' });
  });

  return app;
}
