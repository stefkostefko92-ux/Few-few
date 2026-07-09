// Абстракция над ПОС терминалите (плащане с карта).
// Потокът: касата праща сума → терминалът провежда транзакцията →
// връща одобрение/отказ + референция (RRN / Auth code) за бона.

export interface TerminalResult {
  ok: boolean;
  /** Референция на транзакцията (RRN/Auth code) — пази се в продажбата. */
  reference?: string;
  error?: string;
}

export interface TerminalStatus {
  ok: boolean;
  driver: string;
  detail: string;
}

export interface TerminalDriver {
  readonly id: string;
  readonly label: string;
  status(): Promise<TerminalStatus>;
  /** Иска плащане; блокира до отговор от терминала (или таймаут). */
  purchase(amountCents: number): Promise<TerminalResult>;
  /** Връщане на сума по карта (при сторно с възстановяване по карта). */
  refund(amountCents: number, originalReference?: string): Promise<TerminalResult>;
}
