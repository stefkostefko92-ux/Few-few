// Връзката с ФУ на живо (Прил. № 29, т. 5 и т. 8): проверка, пазене на ИН и часа на
// последната успешна връзка, отместване на часа. Чистите правила са в ./readiness.ts.

import { prisma } from "../db";
import { jsonError } from "../auth";
import { getSetting } from "../settings";
import { getFiscalDriver } from "./index";
import { CLOCK_SYNC_MAX_AGE_MS, clockOffsetMs, isLinkFresh } from "./readiness";

export interface FiscalLink {
  serial: string;
  okAt: string | null;
  detail: string;
  offsetMs: number | null;
  syncedAt: string | null;
}

/** Проверка на живо: пита ФУ, при успех пази ИН, часа на връзката и отместването на часа. */
export async function checkFiscal(): Promise<{ ok: boolean; link: FiscalLink }> {
  const prev = await getSetting("fiscalLink");
  const driver = await getFiscalDriver();
  const now = new Date();
  const st = await driver.status().catch((e: unknown) => ({
    ok: false,
    driver: driver.id,
    detail: e instanceof Error ? e.message : "няма връзка",
    deviceSerial: undefined,
    deviceDateTime: undefined,
  }));
  if (!st.ok || !st.deviceSerial) {
    return {
      ok: false,
      link: { ...prev, detail: st.ok ? "ФУ не върна индивидуален номер." : st.detail },
    };
  }
  const offset = clockOffsetMs(st.deviceDateTime, now);
  const link: FiscalLink = {
    serial: st.deviceSerial,
    okAt: now.toISOString(),
    detail: st.detail,
    offsetMs: offset ?? prev.offsetMs,
    syncedAt: offset !== null ? now.toISOString() : prev.syncedAt,
  };
  await prisma.setting.upsert({
    where: { key: "fiscalLink" },
    create: { key: "fiscalLink", value: JSON.stringify(link) },
    update: { value: JSON.stringify(link) },
  });
  return { ok: true, link };
}

/** Откриване на продажба: ИН на ФУ от връзка до 2 часа назад, иначе нова проверка. */
export async function requireFiscalForOpen(): Promise<string> {
  const link = await getSetting("fiscalLink");
  if (link.serial && isLinkFresh(link.okAt, new Date())) return link.serial;
  const r = await checkFiscal();
  if (!r.ok) {
    throw jsonError(503, `Няма връзка с фискалното устройство — откриването на продажби е блокирано. ${r.link.detail}`);
  }
  return r.link.serial;
}

/** Плащане: проверка на живо, ПРЕДИ терминала да таксува картата. */
export async function requireFiscalForPayment(): Promise<string> {
  const r = await checkFiscal();
  if (!r.ok) {
    throw jsonError(503, `Фискалното устройство не е готово — плащането е блокирано. ${r.link.detail}`);
  }
  return r.link.serial;
}

/** Час по ФУ (т. 5): локалният час плюс последното измерено отместване, ако е от последните 24 ч. */
export async function fiscalNow(): Promise<Date> {
  const link = await getSetting("fiscalLink");
  const now = new Date();
  if (link.offsetMs === null || !isLinkFresh(link.syncedAt, now, CLOCK_SYNC_MAX_AGE_MS)) return now;
  return new Date(now.getTime() + link.offsetMs);
}
