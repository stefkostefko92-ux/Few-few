import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";

export function createApp(): Express {
  const app = express();

  // Behind nginx — trust the first proxy hop for correct IPs / secure cookies.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins, // whitelist, never "*" (S14)
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));

  // Health endpoints are not rate limited (probes hit them frequently).
  app.use("/", healthRouter);

  app.use(globalLimiter);
  app.use("/api/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
