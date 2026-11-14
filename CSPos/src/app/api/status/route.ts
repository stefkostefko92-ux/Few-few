// Обобщен статус за горната лента: ФУ, терминал, смяна на оператора, СУПТО режим,
// лиценз и идентификация на софтуера. Една заявка вместо пет — лентата се опреснява
// на 30 s и не бива да товари слаба каса. Четящ маршрут → допуска одиторския профил.

import { prisma } from "@/lib/db";
import { guard, requireRead } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getFiscalDriver } from "@/lib/fiscal";
import { getTerminalDriver } from "@/lib/terminal";
import { licenseState } from "@/lib/license";
import type { FiscalStatus } from "@/lib/fiscal/types";
import { APP_NAME, APP_VERSION, MANUFACTURER } from "@/lib/constants";
import { suptoSaleBlock } from "@/lib/fiscal/readiness";
import { buildIntegrity } from "@/lib/fiscal/link";

export async function GET() {
  return guard(async () => {
    const s = await requireRead("CASHIER");
    const [fiscalCfg, fiscalLink, store, lic, fiscal, terminal, shift] = await Promise.all([
      getSetting("fiscal"),
      getSetting("fiscalLink"),
      getSetting("store"),
      getSetting("license"),
      getFiscalDriver(),
      getTerminalDriver(),
      prisma.shift.findFirst({
        where: { userId: s.userId, closedAt: null },
        select: { openedAt: true },
      }),
    ]);
    const [fiscalStatus, terminalStatus] = await Promise.all([
      fiscal.status().catch((): FiscalStatus => ({ ok: false, driver: fiscal.id, detail: "няма връзка" })),
      terminal ? terminal.status().catch(() => ({ ok: false, driver: "?", detail: "няма връзка" })) : null,
    ]);
    // Без deviceId лицензът не може да е валиден — не го създаваме от четящ маршрут.
    const license = lic.deviceId
      ? licenseState(lic.blob || null, lic.deviceId, process.env.LICENSE_PUBLIC_KEY)
      : { status: "none" as const, payload: null };

    return Response.json({
      app: { name: APP_NAME, version: APP_VERSION, manufacturer: MANUFACTURER },
      store: { name: store.name, eik: store.eik, storeName: store.storeName, address: store.address, city: store.city },
      fiscal: {
        ok: fiscalStatus.ok,
        detail: fiscalStatus.detail,
        driver: fiscalStatus.driver,
        serial: fiscalStatus.deviceSerial ?? fiscalCfg.deviceSerial,
        fiscalMemory: fiscalCfg.fiscalMemoryNumber,
      },
      terminal: terminalStatus ? { ok: terminalStatus.ok, detail: terminalStatus.detail } : null,
      shift: shift ? { openedAt: shift.openedAt } : null,
      supto: {
        mode: fiscalCfg.suptoMode,
        integrity: buildIntegrity(),
        // защо режим СУПТО спира продажбите в момента (т. 4 подпис, т. 5 час) — null = не спира
        block: suptoSaleBlock({
          suptoMode: fiscalCfg.suptoMode,
          integrity: buildIntegrity(),
          clockSyncedAt: fiscalLink.syncedAt,
          now: new Date(),
        }),
      },
      license: { status: license.status, plan: license.payload?.plan ?? null, expiresAt: license.payload?.expiresAt ?? null },
    });
  });
}
