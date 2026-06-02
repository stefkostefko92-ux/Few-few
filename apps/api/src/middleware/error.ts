import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../http.js";
import { logger } from "../logger.js";
import { captureError } from "../integrations/sentry.js";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Resource not found" } });
};

/** Central error handler. Never leaks internals on 5xx. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid input", issues: err.flatten() },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  logger.error({ err }, "unhandled error");
  captureError(err);
  res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
};
