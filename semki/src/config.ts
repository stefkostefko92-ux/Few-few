// Средата се проверява веднъж при старт; грешката казва кои ключове са счупени, никога стойностите.
import { z } from 'zod';
import { snowflake } from './domain/validation.js';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4340),
    HOST: z.string().min(1).default('127.0.0.1'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'трябва да е postgresql://…'),
    PUBLIC_BASE_URL: z.url().transform((u) => u.replace(/\/+$/, '')),
    SESSION_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/, '64 hex знака (openssl rand -hex 32)'),
    DISCORD_TOKEN: z.string().min(50),
    DISCORD_CLIENT_ID: snowflake,
    DISCORD_CLIENT_SECRET: z.string().min(16),
    DISCORD_GUILD_ID: snowflake,
    TRUST_PROXY: z.string().default('loopback'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    ALERT_TICK_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.PUBLIC_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'в продукция е https://',
      });
    }
  });

export type Config = z.output<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна среда — ${keys}`);
  }
  return parsed.data;
}
