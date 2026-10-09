import type { Device, Product, ProductRevision } from '@prisma/client';
import { can } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';

/**
 * Таблата (§13.1 devices) и QR етикетът (FR-13): справката по сериен номер и по QR токен следват
 * ЕДНИ И СЪЩИ правила за видимост — порталът вижда само таблата на своята фирма.
 */

/** Токенът от етикета: 24 случайни байта в base64url (32 знака); приемаме разумен диапазон. */
export const QR_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
export const QR_TOKEN_BYTES = 24;

export type DeviceWithProduct = Device & { revision: ProductRevision & { product: Product } };

export function deviceVisible(
  user: Principal['user'],
  device: Pick<Device, 'tenantId' | 'companyId'>,
): boolean {
  if (device.tenantId !== user.tenantId) return false;
  return (
    can(user.role, 'device:readAll') ||
    (user.companyId !== null && device.companyId === user.companyId)
  );
}

export function deviceView(device: DeviceWithProduct) {
  return {
    serial: device.serial,
    productModel: device.revision.product.model,
    family: device.revision.product.family,
    hardwareRevision: device.revision.hwRevision,
    firmware: device.firmware,
    options: device.options,
  };
}
