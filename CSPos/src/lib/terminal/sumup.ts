// SumUp Solo — облачна интеграция: касата праща заявка към SumUp Cloud API,
// терминалът я показва и провежда плащането.
// https://developer.sumup.com/terminal-payments/cloud-api
// Изисква API ключ (Authorization: Bearer), merchant code и reader id.

import type { TerminalDriver, TerminalResult, TerminalStatus } from "./types";

interface SumUpConfig {
  apiKey: string;
  merchantCode: string;
  readerId: string;
}

const BASE = "https://api.sumup.com/v0.1";

export class SumUpTerminalDriver implements TerminalDriver {
  readonly id = "sumup";
  readonly label = "SumUp Solo (Cloud API)";

  constructor(private cfg: SumUpConfig) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async status(): Promise<TerminalStatus> {
    if (!this.cfg.apiKey || !this.cfg.merchantCode || !this.cfg.readerId) {
      return {
        ok: false,
        driver: this.id,
        detail: "Липсва конфигурация (API ключ / merchant code / reader id).",
      };
    }
    try {
      const res = await fetch(
        `${BASE}/merchants/${this.cfg.merchantCode}/readers/${this.cfg.readerId}`,
        { headers: this.headers(), signal: AbortSignal.timeout(10_000) }
      );
      return res.ok
        ? { ok: true, driver: this.id, detail: "Четецът е регистриран и достъпен." }
        : { ok: false, driver: this.id, detail: `SumUp API: HTTP ${res.status}` };
    } catch (e) {
      return {
        ok: false,
        driver: this.id,
        detail: `SumUp API недостъпно: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async purchase(amountCents: number): Promise<TerminalResult> {
    try {
      const res = await fetch(
        `${BASE}/merchants/${this.cfg.merchantCode}/readers/${this.cfg.readerId}/checkout`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            total_amount: { value: amountCents, currency: "EUR", minor_unit: 2 },
          }),
          signal: AbortSignal.timeout(120_000),
        }
      );
      const json = (await res.json()) as { data?: { client_transaction_id?: string }; message?: string };
      if (!res.ok) {
        return { ok: false, error: `SumUp: ${json.message ?? `HTTP ${res.status}`}` };
      }
      return { ok: true, reference: json.data?.client_transaction_id };
    } catch (e) {
      return { ok: false, error: `SumUp API: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async refund(): Promise<TerminalResult> {
    return {
      ok: false,
      error:
        "Възстановяване през SumUp се прави от таблото на SumUp (изисква transaction id от справката).",
    };
  }
}
