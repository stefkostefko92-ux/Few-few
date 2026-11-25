export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Днешната дата в България („ГГГГ-ММ-ДД“) — датите на документите са местни, не UTC. */
export function sofiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Дата за показ „ДД.ММ.ГГГГ“ по софийско време: момент (анулиране, покана, ключ) около полунощ по UTC е
 * друг ден в България. Датите без час (издаване, падеж — пазят се като полунощ UTC) остават същите.
 */
export function bgDate(value: Date): string {
  return sofiaToday(value).split('-').reverse().join('.');
}
