// myPOS ECR режим — локална интеграция по TCP/IP (LAN/WiFi).
// Android терминалите (Ultra, Carbon, F20 Pro) слушат на порт 7900 през
// приложението „ECR-POS Connect“; K300 — на порт 60180 (вграден).
// https://developers.mypos.com/guides/troubleshooting-guides/terminal-configuration-ecr-erp
// СТАТУС: скелет по публичната документация — криптографското сдвояване
// (Master Key + Session Keys) се конфигурира от приложението на терминала;
// точният формат на съобщенията изисква myPOS ECR Protocol спецификацията.

import { Socket } from "net";
import type { TerminalDriver, TerminalResult, TerminalStatus } from "./types";

interface MyPosConfig {
  host: string;
  port: number; // 7900 (Android) / 60180 (K300)
}

export class MyPosEcrTerminalDriver implements TerminalDriver {
  readonly id = "mypos-ecr";
  readonly label = "myPOS ECR по LAN (порт 7900/60180)";

  constructor(private cfg: MyPosConfig) {}

  private async send(payload: object, timeoutMs = 120_000): Promise<TerminalResult> {
    return new Promise((resolve) => {
      const sock = new Socket();
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        sock.destroy();
        resolve({ ok: false, error: "Таймаут — терминалът не отговори." });
      }, timeoutMs);

      sock.connect(this.cfg.port, this.cfg.host, () => {
        sock.write(JSON.stringify(payload) + "\n");
      });
      sock.on("data", (c) => {
        chunks.push(c);
        try {
          const res = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            status?: string;
            rrn?: string;
            authCode?: string;
            error?: string;
          };
          clearTimeout(timer);
          sock.end();
          if (res.status === "approved") {
            resolve({ ok: true, reference: res.rrn ?? res.authCode });
          } else {
            resolve({ ok: false, error: res.error ?? `Транзакцията е отказана (${res.status}).` });
          }
        } catch {
          // изчакваме още данни до пълен JSON
        }
      });
      sock.on("error", (e) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: `Няма връзка с myPOS терминала на ${this.cfg.host}:${this.cfg.port} — ${e.message}`,
        });
      });
    });
  }

  async status(): Promise<TerminalStatus> {
    return new Promise((resolve) => {
      const sock = new Socket();
      const timer = setTimeout(() => {
        sock.destroy();
        resolve({ ok: false, driver: this.id, detail: "Терминалът не отговаря." });
      }, 5000);
      sock.connect(this.cfg.port, this.cfg.host, () => {
        clearTimeout(timer);
        sock.end();
        resolve({ ok: true, driver: this.id, detail: "Терминалът е достъпен по мрежата." });
      });
      sock.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, driver: this.id, detail: `Няма връзка: ${e.message}` });
      });
    });
  }

  purchase(amountCents: number): Promise<TerminalResult> {
    return this.send({
      command: "PURCHASE",
      amount: (amountCents / 100).toFixed(2),
      currency: "EUR",
    });
  }

  refund(amountCents: number, originalReference?: string): Promise<TerminalResult> {
    return this.send({
      command: "REFUND",
      amount: (amountCents / 100).toFixed(2),
      currency: "EUR",
      rrn: originalReference,
    });
  }
}
