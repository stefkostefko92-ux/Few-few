/**
 * Минимален регистър на метрики в текстовия формат на Prometheus (0.0.4) — без зависимости (NFR-09).
 * Броячи, gauge-ове и хистограми; без summary (квантилите се смятат в Prometheus от хистограмите).
 *
 * Защо не `prom-client`: нужното подмножество е малко и е покрито с тестове, а всяка зависимост е
 * верига на доставка (dependency-review). Етикетите са ФИКСИРАНИ при дефиниране (`labelNames`), а
 * стойностите им идват от код (шаблон на маршрут, изход, причина) — никога id, имейл или текст.
 * Втора линия срещу взрив на кардиналността: таван на сериите на метрика — новите над тавана се
 * изпускат и се броят в `chatchat_metrics_series_dropped_total`.
 */

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
/** Стойност на етикет по-дълга от това не е код — сигнал за грешка в инструментирането. */
const MAX_VALUE = 64;
const DEFAULT_MAX_SERIES = 500;

export type LabelValues<K extends string> = { readonly [P in K]: string };

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function escapeHelp(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

export function formatValue(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return '+Inf';
  if (n === -Infinity) return '-Inf';
  return String(n);
}

function renderLabels(names: readonly string[], values: readonly string[]): string {
  if (names.length === 0) return '';
  return `{${names.map((n, i) => `${n}="${escapeLabel(values[i] ?? '')}"`).join(',')}}`;
}

interface MetricOptions<K extends string> {
  name: string;
  help: string;
  labelNames?: readonly K[];
  maxSeries?: number;
}

abstract class Metric<K extends string, S> {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly K[];
  protected readonly series = new Map<string, { values: string[]; state: S }>();
  private readonly maxSeries: number;
  /** Сочи към брояча на изпуснатите серии в регистъра (закача се при регистриране). */
  onDrop: (metric: string) => void = () => undefined;

  constructor(opts: MetricOptions<K>) {
    if (!NAME.test(opts.name)) throw new Error(`невалидно име на метрика „${opts.name}“`);
    for (const l of opts.labelNames ?? []) {
      if (!LABEL.test(l) || l === 'le') throw new Error(`невалиден етикет „${l}“`);
    }
    this.name = opts.name;
    this.help = opts.help;
    this.labelNames = opts.labelNames ?? [];
    this.maxSeries = opts.maxSeries ?? DEFAULT_MAX_SERIES;
  }

  abstract readonly type: 'counter' | 'gauge' | 'histogram';
  protected abstract initial(): S;
  abstract renderSeries(values: string[], state: S): string[];

  /** Серията за етикетите или null (над тавана) — непознат/липсващ етикет е грешка в кода. */
  protected slot(labels: LabelValues<K> | undefined): S | null {
    const values = this.labelNames.map((n) => {
      const v = labels?.[n];
      if (typeof v !== 'string') throw new Error(`${this.name}: липсва етикет „${n}“`);
      return v.length > MAX_VALUE ? 'invalid' : v;
    });
    const key = values.join('\u0000');
    const found = this.series.get(key);
    if (found) return found.state;
    if (this.series.size >= this.maxSeries) {
      this.onDrop(this.name);
      return null;
    }
    const state = this.initial();
    this.series.set(key, { values, state });
    return state;
  }

  render(): string {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} ${this.type}`,
    ];
    for (const { values, state } of this.series.values()) {
      lines.push(...this.renderSeries(values, state));
    }
    return lines.join('\n');
  }

  protected labelText(values: readonly string[], extra?: [string, string]): string {
    const names: string[] = [...this.labelNames];
    const vals = [...values];
    if (extra) {
      names.push(extra[0]);
      vals.push(extra[1]);
    }
    return renderLabels(names, vals);
  }
}

export class Counter<K extends string = never> extends Metric<K, { value: number }> {
  readonly type = 'counter' as const;
  protected initial() {
    return { value: 0 };
  }
  inc(labels?: LabelValues<K>, by = 1): void {
    if (!(by >= 0) || !Number.isFinite(by)) return; // броячът само расте
    const s = this.slot(labels);
    if (s) s.value += by;
  }
  /** Текущата стойност — за тестовете. */
  get(labels?: LabelValues<K>): number {
    return this.slot(labels)?.value ?? 0;
  }
  renderSeries(values: string[], s: { value: number }): string[] {
    return [`${this.name}${this.labelText(values)} ${formatValue(s.value)}`];
  }
}

export class Gauge<K extends string = never> extends Metric<K, { value: number }> {
  readonly type = 'gauge' as const;
  /** Стойности, смятани при всяко четене (напр. отворените SSE потоци) — без таймери. */
  collect?: () => void;
  protected initial() {
    return { value: 0 };
  }
  set(labels: LabelValues<K> | undefined, value: number): void {
    const s = this.slot(labels);
    if (s) s.value = value;
  }
  get(labels?: LabelValues<K>): number {
    return this.slot(labels)?.value ?? 0;
  }
  renderSeries(values: string[], s: { value: number }): string[] {
    return [`${this.name}${this.labelText(values)} ${formatValue(s.value)}`];
  }
}

interface HistogramState {
  /** Некумулативни броеве по кофа (последната = +Inf); кумулативни стават при изписване. */
  counts: number[];
  sum: number;
  count: number;
}

export class Histogram<K extends string = never> extends Metric<K, HistogramState> {
  readonly type = 'histogram' as const;
  readonly buckets: readonly number[];

  constructor(opts: MetricOptions<K> & { buckets: readonly number[] }) {
    super(opts);
    const sorted = [...new Set(opts.buckets)].filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) throw new Error(`${opts.name}: няма кофи`);
    this.buckets = sorted;
  }

  protected initial(): HistogramState {
    return { counts: new Array<number>(this.buckets.length + 1).fill(0), sum: 0, count: 0 };
  }

  observe(labels: LabelValues<K> | undefined, value: number): void {
    if (!Number.isFinite(value)) return;
    const s = this.slot(labels);
    if (!s) return;
    let i = this.buckets.findIndex((b) => value <= b);
    if (i === -1) i = this.buckets.length;
    s.counts[i] = (s.counts[i] ?? 0) + 1;
    s.sum += value;
    s.count += 1;
  }

  /** Броят и сумата на серията — за тестовете. */
  snapshot(labels?: LabelValues<K>): { count: number; sum: number; cumulative: number[] } {
    const s = this.slot(labels);
    if (!s) return { count: 0, sum: 0, cumulative: [] };
    let acc = 0;
    return { count: s.count, sum: s.sum, cumulative: s.counts.map((c) => (acc += c)) };
  }

  renderSeries(values: string[], s: HistogramState): string[] {
    const out: string[] = [];
    let acc = 0;
    this.buckets.forEach((b, i) => {
      acc += s.counts[i] ?? 0;
      out.push(`${this.name}_bucket${this.labelText(values, ['le', formatValue(b)])} ${acc}`);
    });
    out.push(`${this.name}_bucket${this.labelText(values, ['le', '+Inf'])} ${s.count}`);
    out.push(`${this.name}_sum${this.labelText(values)} ${formatValue(s.sum)}`);
    out.push(`${this.name}_count${this.labelText(values)} ${s.count}`);
    return out;
  }
}

type AnyMetric = Counter<string> | Gauge<string> | Histogram<string>;

export class Registry {
  private readonly metrics = new Map<string, AnyMetric>();
  private readonly dropped: Counter<'metric'>;

  constructor() {
    this.dropped = this.register(
      new Counter({
        name: 'chatchat_metrics_series_dropped_total',
        help: 'Серии, изпуснати заради тавана на кардиналността (грешка в инструментирането).',
        labelNames: ['metric'],
      }),
    );
  }

  register<M extends AnyMetric>(metric: M): M {
    if (this.metrics.has(metric.name))
      throw new Error(`метриката „${metric.name}“ вече е записана`);
    metric.onDrop = (name) => {
      if (name !== this.dropped.name) this.dropped.inc({ metric: name });
    };
    this.metrics.set(metric.name, metric);
    return metric;
  }

  /** Текстовият формат за `/metrics` (Content-Type: `text/plain; version=0.0.4`). */
  render(): string {
    const blocks: string[] = [];
    for (const m of this.metrics.values()) {
      if (m instanceof Gauge) m.collect?.();
      blocks.push(m.render());
    }
    return `${blocks.join('\n')}\n`;
  }
}

export const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
