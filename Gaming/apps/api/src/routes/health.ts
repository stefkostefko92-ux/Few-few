import { Router } from "express";
import { prisma } from "@aso/db";
import { pingRedis } from "../redis.js";
import { asyncHandler } from "../http.js";

export const healthRouter: Router = Router();

/** Liveness — always 200 if the process is up (used by Docker HEALTHCHECK + nginx). */
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "api", ts: new Date().toISOString() });
});

/** Readiness — checks downstream dependencies (DB + Redis). */
healthRouter.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    const [db, cache] = await Promise.all([
      prisma
        .$queryRaw`SELECT 1`.then(() => true)
        .catch(() => false),
      pingRedis(),
    ]);
    const ready = db && cache;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "degraded", db, redis: cache });
  }),
);
