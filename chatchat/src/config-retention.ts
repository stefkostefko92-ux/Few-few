import { z } from 'zod';
import { withoutEmpty } from './config.js';

/**
 * Ретенция по класове (NFR-08, NFR-13) — средата на CLI-то `npm run retention` (без ключовете на
 * приложението; хранилището на файловете — `loadFilesConfig` в config.ts). Празно = „не е
 * зададено“: съобщенията и случаите без срок не се трият (решение на администратора на данните).
 */

/** Срок в дни, който може да е „не е зададен“ (null → класът не се трие). */
const optionalDays = (min: number) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(3650)
    .optional()
    .transform((v) => v ?? null);

const RetentionEnvSchema = z.object({
  /** Изтекли/отнети сесии. */
  RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  /** Затворени случаи (със съобщенията, тикета, хронологията, файловете). Празно → не се трият. */
  RETENTION_CASE_DAYS: optionalDays(30),
  /** Съобщения в директни разговори / групи / канали (с файловете им). Празно → не се трият. */
  RETENTION_DIRECT_DAYS: optionalDays(7),
  RETENTION_GROUP_DAYS: optionalDays(7),
  RETENTION_CHANNEL_DAYS: optionalDays(7),
  /** Известията (прочетени и непрочетени) — метаданни за координация. */
  RETENTION_NOTIFICATION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  /** Присъствието („последно видян“) — кратко (§15: „retention breve“). */
  RETENTION_PRESENCE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /**
   * Метаданни: изпратени/отпаднали имейли от outbox-а, използвани/изтекли линкове за парола,
   * следите на изтрити съобщения (без текст) — и метаданните на обажданията, когато ги има.
   */
  RETENTION_METADATA_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
  /**
   * Одитът — по подразбиране 10 години. Изтриването НЕ чупи веригата: контролна точка с хеша на
   * последното изтрито събитие (AuditCheckpoint + събитие `audit.checkpoint` във веригата).
   */
  RETENTION_AUDIT_DAYS: z.coerce.number().int().min(365).max(36500).default(3650),
  /** Архив (JSONL) на изтритите одитни събития преди триенето; празно → без архив. */
  RETENTION_AUDIT_ARCHIVE_DIR: z.string().default(''),
  /**
   * Затворените предложения към знанието (ACCEPTED/REJECTED, FR-10) — маскиран текст и id-та;
   * отворените не се трият никога. Празно → не се трият (решение на администратора на данните).
   */
  RETENTION_PROPOSAL_DAYS: optionalDays(30),
  /** Качен, но непривързан файл (или PDF, който не е станал документ). */
  RETENTION_ORPHAN_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  /** INFECTED/FAILED редовете (файлът е изтрит при сканирането). */
  RETENTION_QUARANTINE_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

export type RetentionConfig = z.infer<typeof RetentionEnvSchema>;

export function loadRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  const parsed = RetentionEnvSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невалидна конфигурация на ретенцията: ${issues}`);
  }
  return parsed.data;
}
