import type { Case, Device, PrismaClient, Product, ProductRevision } from '@prisma/client';
import { can } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import { DiagnosticContextSchema } from '../domain/context.js';

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

/**
 * Провереното табло на случая — само с него схемите за конкретно табло влизат в търсенето.
 * Таблото е вързано при създаването (сериен номер/QR, видимостта е проверена там); контекстът
 * обаче е редактируем (FR-02): ако серийният номер или моделът в него вече не са на таблото,
 * таблото не е доказано → null (само общите документи + искане на сериен номер).
 */
export async function caseBoardId(
  db: PrismaClient,
  c: Pick<Case, 'tenantId' | 'deviceId' | 'context'>,
): Promise<string | null> {
  if (!c.deviceId) return null;
  const ctx = DiagnosticContextSchema.safeParse(c.context);
  if (!ctx.success || ctx.data.serial === null) return null;
  const device = await db.device.findFirst({
    where: { id: c.deviceId, tenantId: c.tenantId },
    include: { revision: { include: { product: true } } },
  });
  if (!device) return null;
  const same =
    device.serial === ctx.data.serial && device.revision.product.model === ctx.data.productModel;
  return same ? device.id : null;
}
