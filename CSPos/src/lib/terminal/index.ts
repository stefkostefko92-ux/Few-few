// Фабрика: настройката „terminal.driver“ определя активния терминал.

import { getSetting } from "../settings";
import { DemoTerminalDriver } from "./demo";
import { MyPosEcrTerminalDriver } from "./mypos";
import { SumUpTerminalDriver } from "./sumup";
import { BoricaTerminalDriver } from "./borica";
import type { TerminalDriver, TerminalResult, TerminalStatus } from "./types";

/** Прил. № 29, т. 20: демо терминал в режим СУПТО би „одобрявал“ карти без пари — отказ. */
class BlockedTerminalDriver implements TerminalDriver {
  readonly id = "blocked";
  readonly label = "Блокиран (демо терминал в режим СУПТО)";
  private readonly reason = "Режим СУПТО е включен, а за терминала е избран демо драйвер (Прил. № 29, т. 20).";
  async status(): Promise<TerminalStatus> {
    return { ok: false, driver: this.id, detail: this.reason };
  }
  async purchase(): Promise<TerminalResult> {
    return { ok: false, error: this.reason };
  }
  async refund(): Promise<TerminalResult> {
    return { ok: false, error: this.reason };
  }
}

/** „none“ — карти се приемат на самостоятелен терминал без връзка с касата. */
export async function getTerminalDriver(): Promise<TerminalDriver | null> {
  const [cfg, fiscal] = await Promise.all([getSetting("terminal"), getSetting("fiscal")]);
  if (fiscal.suptoMode && cfg.driver === "demo") return new BlockedTerminalDriver();
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
