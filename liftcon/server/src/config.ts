// Конфигурацията идва само от средата (тайните живеят на сървъра, mode 600). Грешна среда = отказ при старт.
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4370),
  // Произходът на сайта: заявки с чужд Origin се отказват (формата и панелът са само на нашия домейн).
  ALLOWED_ORIGIN: z
    .url()
    .default("https://liftcon.it")
    .transform((u) => new URL(u).origin),
  BREVO_API_KEY: z.string().min(20),
  MAIL_FROM: z.email(),
  MAIL_FROM_NAME: z.string().min(1).max(60).default("LiftCon"),
  MAIL_TO: z.email(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),
  // Панелът (/admin). Без DATABASE_URL сървърът работи само като форма → имейл.
  DATABASE_URL: z.string().startsWith("postgresql://").optional(),
  JWT_SECRET: z.string().min(32).optional(),
  SEAL_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "32 byte in esadecimale").optional(),
  SITE_DIR: z.string().default("/srv/site"),
  SITE_SRC: z.string().default("/app/site"),
  CONTENT_DEFAULTS: z.string().default("/app/content-defaults.json"),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_NAME: z.string().min(2).max(100).default("Amministratore"),
  ADMIN_INITIAL_PASSWORD: z.string().min(12).optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Конфигурацията е непълна или грешна: ${fields}`);
  }
  const c = parsed.data;
  if (c.DATABASE_URL && (!c.JWT_SECRET || !c.SEAL_KEY)) throw new Error("Con DATABASE_URL servono anche JWT_SECRET e SEAL_KEY");
  return c;
}
