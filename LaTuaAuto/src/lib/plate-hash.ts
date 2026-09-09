import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Хеш за търсене на табела без да се пази в четим вид в индексите.
 * Pepper-ът е сървърна тайна (PLATE_PEPPER); без него функцията отказва —
 * fail-closed, за да не се произведе слаб хеш по погрешка.
 * Отделен от plate.ts, защото той се ползва и в клиента (node:crypto не се бъндълва).
 */
export function hashPlate(normalizedPlate: string, pepper: string): string {
  if (!pepper || pepper.length < 16) {
    throw new Error('PLATE_PEPPER липсва или е твърде къс (мин. 16 знака)');
  }
  return createHash('sha256').update(`${pepper}:${normalizedPlate}`).digest('hex');
}
