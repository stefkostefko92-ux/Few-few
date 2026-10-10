import 'server-only';
import pino from 'pino';

// Structured logs on stdout. Never log personal data: ids only, no e-mails, names or project data.
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { app: 'liftpilot' },
  redact: { paths: ['password', '*.password', 'email', '*.email', 'req.headers.cookie'], remove: true },
});
