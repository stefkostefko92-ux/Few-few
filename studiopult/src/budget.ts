/**
 * Дневният таван (критерий 9, решение на собственика 28.11.2026: $20 на ден, $3 на съобщение). Сумата е по
 * местна дата и се пази на диска; при 75% страницата предупреждава и не пуска нова работа. Повреден файл →
 * таванът се смята за изчерпан (fail closed) — по-добре спрян пулт, отколкото харчене без мярка.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface BudgetStatus {
  spent: number;
  limit: number;
  warn: boolean;
  blocked: boolean;
}

const localDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export class DailyBudget {
  private readonly file: string;
  private readonly limit: number;
  private readonly warnAt: number;
  private readonly now: () => Date;
  private corrupt = false;

  constructor(opts: { file: string; dailyUsd: number; warnAt?: number; now?: () => Date }) {
    this.file = opts.file;
    this.limit = opts.dailyUsd;
    this.warnAt = opts.warnAt ?? 0.75;
    this.now = opts.now ?? (() => new Date());
  }

  private read(): number {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return 0; // няма файл — нов ден/първо пускане
    }
    try {
      const j = JSON.parse(raw) as { date?: unknown; spent?: unknown };
      if (j.date !== localDate(this.now())) return 0;
      if (typeof j.spent !== 'number' || !Number.isFinite(j.spent) || j.spent < 0)
        throw new Error('сума');
      this.corrupt = false;
      return j.spent;
    } catch {
      this.corrupt = true;
      return Infinity;
    }
  }

  status(): BudgetStatus {
    const spent = this.read();
    const blocked = this.corrupt || spent >= this.limit * this.warnAt;
    return {
      spent: Number.isFinite(spent) ? Math.round(spent * 10000) / 10000 : this.limit,
      limit: this.limit,
      warn: blocked,
      blocked,
    };
  }

  add(usd: number): void {
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0)
      throw new Error('невалидна сума');
    const cur = this.read();
    const spent = (Number.isFinite(cur) ? cur : 0) + usd;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ date: localDate(this.now()), spent }), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.corrupt = false;
  }
}
