import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { csrfOriginGuard } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { accountRouter } from "./routes/account.js";
import { friendsRouter } from "./routes/friends.js";
import { notificationsRouter } from "./routes/notifications.js";
import { shopRouter } from "./routes/shop.js";
import { cosmeticsRouter } from "./routes/cosmetics.js";
import { progressionRouter } from "./routes/progression.js";
import { adminRouter } from "./routes/admin.js";
import { metricsRouter } from "./routes/metrics.js";
import { stripeWebhookRouter } from "./webhooks/stripe.js";

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
  // Correlation IDs: honour an inbound x-request-id (from nginx or the realtime
  // service) else mint one, attach it to every log line and echo it back so a
  // request can be traced across services.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
    }),
  );

  // Stripe webhook MUST receive the raw body for signature verification, so it
  // is mounted before cookieParser/json (§11.3). It is also not rate limited.
  app.use("/", stripeWebhookRouter);

  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));

  // Health endpoints are not rate limited (probes hit them frequently).
  app.use("/", healthRouter);

  app.use(globalLimiter);
  // CSRF defence-in-depth for cookie auth: reject cross-origin state changes.
  app.use("/api", csrfOriginGuard);
  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/cosmetics", cosmeticsRouter);
  app.use("/api/progression", progressionRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/metrics", metricsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
