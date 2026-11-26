// Конфигурацията идва само от средата (тайните живеят на сървъра, mode 600). Грешна среда = отказ при старт.
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4370),
  // Произходът на сайта: заявки с чужд Origin се отказват (формата е само на нашия домейн).
  ALLOWED_ORIGIN: z.url().default("https://liftcom.it"),
  BREVO_API_KEY: z.string().min(20),
  MAIL_FROM: z.email(),
  MAIL_FROM_NAME: z.string().min(1).max(60).default("LiftCon"),
  MAIL_TO: z.email(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Конфигурацията е непълна или грешна: ${fields}`);
  }
  return parsed.data;
}
