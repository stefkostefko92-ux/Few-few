// Фабрика: настройката „fiscal.driver“ определя активния драйвер.

import { getSetting } from "../settings";
import { DemoFiscalDriver } from "./demo";
import { ErpNetFiscalDriver } from "./erpnet";
import { TremolFiscalDriver } from "./tremol";
import { DatecsLanFiscalDriver } from "./datecs-lan";
import type { FiscalDriver } from "./types";

export async function getFiscalDriver(): Promise<FiscalDriver> {
  const cfg = await getSetting("fiscal");
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
