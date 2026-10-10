import { BUSINESS_TZ } from '../time.js';

/**
 * Номерът на поръчката за хората: „KP-2026-000123“ — годината на поръчката (по София) и поредният номер
 * от базата. Чете се, диктува се по телефона и стои като основание в банковия превод; вътрешният cuid не
 * излиза пред клиента.
 */
export function orderNo(order: { number: number; createdAt: Date }): string {
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: BUSINESS_TZ }).format(
    order.createdAt,
  );
  return `KP-${year}-${String(order.number).padStart(6, '0')}`;
}
