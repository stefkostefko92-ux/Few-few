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

/**
 * Цени в USD за 1M токена — копие на `tools/agents/prices.json` (сверено 2026-11-24; тест пази синхрона).
 * Кеш-записът е по 1-часовия живот (2× входа) — по-скъпият, защото оценката трябва да е отгоре, не отдолу.
 */
export const PRICES: Record<
  string,
  { in: number; out: number; cacheRead: number; cacheWrite: number }
> = {
  'opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 8 },
  'sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 4 },
  'fable-5-2': { in: 8, out: 40, cacheRead: 0.2, cacheWrite: 16 },
};
const TOP = Object.values(PRICES).reduce((a, b) => (b.out > a.out ? b : a));

function priceOf(model: unknown): (typeof PRICES)[string] {
  const m = String(model ?? '').toLowerCase();
  for (const [id, p] of Object.entries(PRICES)) if (m.includes(id)) return p;
  return TOP; // непознат модел → най-скъпият (fail closed)
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Разходът на едно пускане по стъпките — само когато SDK не върне резултат (спрян, сринал се разговор). */
export class RunMeter {
  private readonly msgs = new Map<string, { model: unknown; u: Required<Usage> }>();
  private anon = 0;

  /** Едно API съобщение идва на няколко реда със същото id — брои се веднъж, с най-големите стойности. */
  onAssistant(message: { id?: unknown; model?: unknown; usage?: Usage } | undefined): void {
    if (!message?.usage) return;
    const id = typeof message.id === 'string' && message.id ? message.id : `#${this.anon++}`;
    const prev = this.msgs.get(id)?.u;
    const u = message.usage;
    this.msgs.set(id, {
      model: message.model,
      u: {
        input_tokens: Math.max(n(prev?.input_tokens), n(u.input_tokens)),
        output_tokens: Math.max(n(prev?.output_tokens), n(u.output_tokens)),
        cache_read_input_tokens: Math.max(
          n(prev?.cache_read_input_tokens),
          n(u.cache_read_input_tokens),
        ),
        cache_creation_input_tokens: Math.max(
          n(prev?.cache_creation_input_tokens),
          n(u.cache_creation_input_tokens),
        ),
      },
    });
  }

  estimate(): number {
    let usd = 0;
    for (const { model, u } of this.msgs.values()) {
      const p = priceOf(model);
      usd +=
        (u.input_tokens * p.in +
          u.output_tokens * p.out +
          u.cache_read_input_tokens * p.cacheRead +
          u.cache_creation_input_tokens * p.cacheWrite) /
        1e6;
    }
    return usd;
  }
}

/**
 * Колко от разхода на SDK влиза в дневния таван. `total_cost_usd` е за цялата сесия, включително по-ранните
 * пускания при продължение (code.claude.com/docs/en/agent-sdk/cost-tracking), затова се брои делтата спрямо
 * последното видяно за сесията. Оценка за спрян разговор също влиза в базата: така продължението не го брои
 * втори път, а сборът никога не е под истинския разход. След рестарт на пулта базата е празна → първото
 * продължение се брои цяло (отгоре, не отдолу).
 */
export class SpendMeter {
  private readonly totals = new Map<string, number>();

  onResult(sessionId: string, total: number): number {
    const prev = this.totals.get(sessionId) ?? 0;
    const t = n(total);
    if (t > prev) this.totals.set(sessionId, t);
    return Math.max(0, t - prev);
  }

  onEstimate(sessionId: string | undefined, usd: number): number {
    const v = n(usd);
    if (sessionId) this.totals.set(sessionId, (this.totals.get(sessionId) ?? 0) + v);
    return v;
  }

  startRun(): RunMeter {
    return new RunMeter();
  }
}
