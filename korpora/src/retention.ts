import type { Translator } from './i18n.js';
import { DAY, HOUR } from './time.js';

/**
 * Сроковете за пазене, обявени в политиката за поверителност. Едно място за поддръжката, която трие,
 * за бисквитката на устройството и за самия текст на политиката — трите не могат да се разминат.
 */

/**
 * Колко пазим входовете (IP, държава, устройство), устройствата, които не са виждани, отпечатъка от
 * регистрацията и IP адресите в одитния дневник — после се трият или заличават.
 */
export const LOGIN_RETENTION_DAYS = 180;

/**
 * Непотвърдена регистрация (клиент с тестов период, който не е влизал) се трие след толкова дни — от
 * `runMaintenance`.
 */
export const UNVERIFIED_RETENTION_DAYS = 7;

/**
 * Шифрованият дневен бекъп на базата (`deploy/backup.sh`): пази най-новото копие от всеки от последните
 * толкова дни и от всяка от последните толкова седмици, по-старите трие. Скриптът е на bash и има свои
 * стойности по подразбиране — тестът ги сверява с тези тук, а политиката показва тези. Друга стойност в
 * средата на сървъра (KORPORA_BACKUP_DAILY/WEEKLY) иска и промяна тук, иначе политиката не е вярна.
 */
export const BACKUP_KEEP_DAILY = 14;
export const BACKUP_KEEP_WEEKLY = 8;

/** Дъмповете на базата преди миграция при деплой (`deploy/deploy.sh`, KORPORA_KEEP_BACKUPS): последните толкова. */
export const PRE_DEPLOY_BACKUPS_KEPT = 5;

/**
 * Срок за пазене в дни, както го казва правният текст: в години, ако се дели точно на 365
 * (1825 → „5 години“), иначе в дни. Така политиката показва срока, по който трие кодът, а не число,
 * писано на ръка.
 */
export function retentionText(days: number, t: Translator): string {
  return days % 365 === 0
    ? t('legal.retention.years', { n: days / 365 })
    : t('legal.retention.days', { n: days });
}

/**
 * Срок от кода в най-едрата цяла единица, както го казва текстът: години, дни (от два нагоре), часове,
 * минути — „1 година“, „30 дни“, „24 часа“, „2 часа“, „1 минута“.
 */
export function durationText(ms: number, t: Translator): string {
  if (ms % DAY === 0 && ms >= 2 * DAY) return retentionText(ms / DAY, t);
  if (ms % HOUR === 0) return t('common.hours', { n: ms / HOUR });
  return t('common.minutes', { n: Math.round(ms / 60_000) });
}
