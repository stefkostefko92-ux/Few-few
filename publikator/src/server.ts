import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { healthRouter } from './routes/health.js';
import { oauthRouter } from './routes/oauth.js';
import { postsRouter } from './routes/posts.js';

export function createServer(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);
  app.use(oauthRouter);
  app.use(postsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Няма такъв маршрут.' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error.message }, 'необработена грешка в маршрут');
    res.status(500).json({ error: 'Вътрешна грешка.' });
  });

  return app;
}
