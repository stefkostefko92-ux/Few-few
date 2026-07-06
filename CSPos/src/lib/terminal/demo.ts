// Демо терминал: одобрява след кратко забавяне и връща симулирана референция.

import type { TerminalDriver, TerminalResult, TerminalStatus } from "./types";

function fakeRef(): string {
  return `DEMO-${Date.now().toString(36).toUpperCase()}`;
}

export class DemoTerminalDriver implements TerminalDriver {
  readonly id = "demo";
  readonly label = "Демо терминал (симулация)";

  async status(): Promise<TerminalStatus> {
    return { ok: true, driver: this.id, detail: "Симулация — одобрява всички транзакции." };
  }

  async purchase(amountCents: number): Promise<TerminalResult> {
    if (amountCents <= 0) return { ok: false, error: "Невалидна сума." };
    await new Promise((r) => setTimeout(r, 1200)); // „поставете картата…“
    return { ok: true, reference: fakeRef() };
  }

  async refund(amountCents: number): Promise<TerminalResult> {
    if (amountCents <= 0) return { ok: false, error: "Невалидна сума." };
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, reference: fakeRef() };
  }
}
