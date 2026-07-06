// Фабрика: настройката „terminal.driver“ определя активния терминал.

import { getSetting } from "../settings";
import { DemoTerminalDriver } from "./demo";
import { MyPosEcrTerminalDriver } from "./mypos";
import { SumUpTerminalDriver } from "./sumup";
import { BoricaTerminalDriver } from "./borica";
import type { TerminalDriver } from "./types";

/** „none“ — карти се приемат на самостоятелен терминал без връзка с касата. */
export async function getTerminalDriver(): Promise<TerminalDriver | null> {
  const cfg = await getSetting("terminal");
  switch (cfg.driver) {
    case "mypos-ecr":
      return new MyPosEcrTerminalDriver({ host: cfg.host, port: cfg.port });
    case "sumup":
      return new SumUpTerminalDriver({
        apiKey: cfg.apiKey,
        merchantCode: cfg.merchantCode,
        readerId: cfg.readerId,
      });
    case "borica":
      return new BoricaTerminalDriver();
    case "none":
      return null;
    case "demo":
    default:
      return new DemoTerminalDriver();
  }
}

export const TERMINAL_DRIVERS = [
  { id: "demo", label: "Демо терминал (симулация)" },
  { id: "mypos-ecr", label: "myPOS ECR по LAN (порт 7900 / 60180)" },
  { id: "sumup", label: "SumUp Solo (Cloud API)" },
  { id: "borica", label: "BORICA банков терминал (след NDA)" },
  { id: "none", label: "Без връзка (самостоятелен терминал)" },
] as const;
