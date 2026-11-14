// Фабрика: настройката „fiscal.driver“ определя активния драйвер.

import { getSetting } from "../settings";
import { DemoFiscalDriver } from "./demo";
import { ErpNetFiscalDriver } from "./erpnet";
import { TremolFiscalDriver } from "./tremol";
import { DatecsLanFiscalDriver } from "./datecs-lan";
import type { FiscalDriver, FiscalResult, FiscalStatus } from "./types";

/**
 * Прил. № 29, т. 20: в режим СУПТО няма демо режим. Ако настройките все пак сочат демо
 * драйвера (стара база, ръчна намеса), касата не печата — отказва затворено.
 */
class BlockedFiscalDriver implements FiscalDriver {
  readonly id = "blocked";
  readonly label = "Блокиран (демо драйвер в режим СУПТО)";
  private readonly reason =
    "Режим СУПТО е включен, а за ФУ е избран демо драйвер (Прил. № 29, т. 20). Изберете реално фискално устройство.";
  async status(): Promise<FiscalStatus> {
    return { ok: false, driver: this.id, detail: this.reason };
  }
  private async refuse(): Promise<FiscalResult> {
    return { ok: false, error: this.reason };
  }
  printReceipt = this.refuse;
  printStorno = this.refuse;
  cashInOut = this.refuse;
  xReport = this.refuse;
  zReport = this.refuse;
}

export async function getFiscalDriver(): Promise<FiscalDriver> {
  const cfg = await getSetting("fiscal");
  if (cfg.suptoMode && cfg.driver === "demo") return new BlockedFiscalDriver();
  switch (cfg.driver) {
    case "erpnet":
      return new ErpNetFiscalDriver({
        host: cfg.host,
        port: cfg.port,
        printerId: cfg.printerId,
      });
    case "tremol":
      return new TremolFiscalDriver({ host: cfg.host, port: cfg.port });
    case "datecs-lan":
      return new DatecsLanFiscalDriver({ host: cfg.host, port: cfg.port });
    case "demo":
    default:
      return new DemoFiscalDriver();
  }
}

export const FISCAL_DRIVERS = [
  { id: "demo", label: "Демо (симулация)" },
  { id: "erpnet", label: "ErpNet.FP мост — Datecs/Tremol/Daisy/Eltrade/Incotex (препоръчан)" },
  { id: "tremol", label: "Tremol ZFPLab сървър (порт 4444)" },
  { id: "datecs-lan", label: "Datecs X директно по LAN (експериментален)" },
] as const;
