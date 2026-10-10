import { z } from 'zod';
import { describeIssues, isKey32, withoutEmpty } from './config-env.js';

/**
 * Настройките на частното файлово хранилище (прикачените файлове, NFR-03) — общи за приложението,
 * worker-а и CLI-тата (ретенция, `files:*`, пробата за възстановяване). Fail-closed: с хранилище и
 * `on` без валиден KEK процесът не тръгва; `off` в продукция — също не.
 */

export const FILES_ENV = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  /** Частното хранилище на прикачените файлове (F2). Празно → прикачването е изключено. */
  ATTACHMENTS_DIR: z.string().default(''),
  /**
   * Шифроване на файловете в покой (NFR-03, src/storage/envelope.ts). `off` — само за тестове/dev:
   * в продукция процесът не тръгва с него. С `on` (по подразбиране) без FILES_KEK — също не тръгва.
   */
  FILES_ENCRYPTION: z.enum(['on', 'off']).default('on'),
  /** Главният ключ (KEK, 32 байта в base64), който опакова ключа на всеки файл. Загуба = файловете. */
  FILES_KEK: z.string().trim().default(''),
  /** Стари KEK след ротация (запетаи) — само за четене, докато `npm run files:rekey` не мине. */
  FILES_KEK_PREVIOUS: z.string().trim().default(''),
  /** Стари нешифровани файлове: allow — четат се (преходът); deny — отказ (след files:encrypt). */
  FILES_PLAINTEXT: z.enum(['allow', 'deny']).default('allow'),
};

/** FILES_KEK_PREVIOUS: стари KEK, разделени със запетая (само за четене до `files:rekey`). */
function previousKeks(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const FilesSchema = z.object(FILES_ENV);
export type FilesConfig = z.infer<typeof FilesSchema>;

/**
 * Шифроването на файловете — fail-closed: с хранилище и `on` без валиден KEK процесът не тръгва;
 * `off` в продукция — също не. Без хранилище (ATTACHMENTS_DIR празно) ключ не трябва.
 */
export function checkFilesCrypto(c: FilesConfig, ctx: z.RefinementCtx): void {
  if (c.ATTACHMENTS_DIR === '') return;
  if (c.FILES_ENCRYPTION === 'off') {
    if (c.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['FILES_ENCRYPTION'],
        message: 'FILES_ENCRYPTION=off е само за тестове/dev — в продукция файловете са шифровани',
      });
    }
    return;
  }
  if (!isKey32(c.FILES_KEK)) {
    ctx.addIssue({
      code: 'custom',
      path: ['FILES_KEK'],
      message:
        'FILES_KEK трябва да е 32 байта в base64 (openssl rand -base64 32), щом ATTACHMENTS_DIR е зададен',
    });
  }
  if (!previousKeks(c.FILES_KEK_PREVIOUS).every(isKey32)) {
    ctx.addIssue({
      code: 'custom',
      path: ['FILES_KEK_PREVIOUS'],
      message: 'FILES_KEK_PREVIOUS: ключове по 32 байта в base64, разделени със запетая',
    });
  }
}

/**
 * Само настройките на файловото хранилище — за CLI-тата (ретенция, `files:*`, пробата за
 * възстановяване), които не искат цялата среда на приложението. Същите правила (fail-closed).
 */
export function loadFilesConfig(env: NodeJS.ProcessEnv = process.env): FilesConfig {
  const parsed = FilesSchema.superRefine(checkFilesCrypto).safeParse(withoutEmpty(env));
  if (!parsed.success) {
    throw new Error(`Невалидна конфигурация: ${describeIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}

/** KEK-овете като байтове (валидирани от схемата); null → шифроването е изключено. */
export function filesKeks(
  cfg: Pick<FilesConfig, 'FILES_ENCRYPTION' | 'FILES_KEK' | 'FILES_KEK_PREVIOUS'>,
): { current: Buffer; previous: Buffer[] } | null {
  if (cfg.FILES_ENCRYPTION === 'off') return null;
  if (!isKey32(cfg.FILES_KEK)) throw new Error('FILES_KEK липсва или е невалиден.');
  return {
    current: Buffer.from(cfg.FILES_KEK, 'base64'),
    previous: previousKeks(cfg.FILES_KEK_PREVIOUS).map((k) => Buffer.from(k, 'base64')),
  };
}
