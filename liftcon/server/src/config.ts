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
  // Brevo: si configura anche dal pannello (/admin/impostazioni); questi valori servono da riserva.
  BREVO_API_KEY: z.string().min(20).optional(),
  MAIL_FROM: z.email().optional(),
  MAIL_FROM_NAME: z.string().min(1).max(60).default("LiftCon"),
  MAIL_TO: z.email().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),
  // Панелът (/admin). Без DATABASE_URL сървърът работи само като форма → имейл.
  DATABASE_URL: z.string().startsWith("postgresql://").optional(),
  JWT_SECRET: z.string().min(32).optional(),
  SEAL_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "32 byte in esadecimale").optional(),
  SITE_DIR: z.string().default("/srv/site"),
  // Снимките и издадените PDF на документите (том на сървъра, в бекъпа).
  DATA_DIR: z.string().default("/srv/data"),
  // Списъкът на изтриванията (документи, заявки) — извън бекъпите; при старт се прилага пак (D16а).
  ELIMINAZIONI_DIR: z.string().default("/srv/eliminazioni"),
  SITE_SRC: z.string().default("/app/site"),
  CONTENT_DEFAULTS: z.string().default("/app/content-defaults.json"),
  // Първият администратор не идва от средата: deploy.sh го създава (stdin → dist/cli/primo-admin.js).
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
