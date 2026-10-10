import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Counter, Gauge, Histogram, Registry } from './metrics.js';

/**
 * Каталогът на метриките на ChatChat (NFR-09). Всички етикети са затворени множества от кодове:
 * шаблон на маршрут (`/api/v1/cases/:id`, никога суровият път), метод, статус, изход, причина.
 * НИКОГА tenantId, userId, имейл, номер на случай или текст — нито тук, нито в нов етикет.
 *
 * Кофите са подбрани около праговете на SLO-тата (docs/runbook.md):
 *  - NFR-02: P95 на текстовия AI отговор ≤ 8 s → кофа точно на 8;
 *  - NFR-11: P95 на доставката в реално време ≤ 2 s → кофа точно на 2.
 */

const HTTP_BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120];
const AI_BUCKETS = [0.5, 1, 2, 4, 6, 8, 10, 15, 20, 30, 45, 60, 90, 120];
const REALTIME_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const AV_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
const JOB_BUCKETS = [0.1, 0.5, 1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600];

/** Изходът на едно AI питане — затвореното множество за етикета `outcome`. */
export const AI_OUTCOMES = [
  'answered',
  'no_evidence',
  'ai_unavailable',
  'timeout',
  'error',
  'cancelled',
] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

export type BreakerName = 'vertex_messages' | 'vertex_embeddings';
export type BreakerState = 'closed' | 'open' | 'half_open';
export const BREAKER_STATE_VALUE: Record<BreakerState, number> = {
  closed: 0,
  half_open: 1,
  open: 2,
};

export function createMetrics() {
  const registry = new Registry();
  const r = <M extends Counter<string> | Gauge<string> | Histogram<string>>(m: M): M =>
    registry.register(m);

  const metrics = {
    registry,
    httpRequests: r(
      new Counter<'method' | 'route' | 'status'>({
        name: 'chatchat_http_requests_total',
        help: 'HTTP заявки по шаблон на маршрута, метод и статус (RED: rate + errors).',
        labelNames: ['method', 'route', 'status'],
      }),
    ),
    httpDuration: r(
      new Histogram<'method' | 'route'>({
        name: 'chatchat_http_request_duration_seconds',
        help: 'Продължителност на HTTP заявка по шаблон на маршрута (RED: duration). Без SSE потока.',
        labelNames: ['method', 'route'],
        buckets: HTTP_BUCKETS,
      }),
    ),
    aiAnswers: r(
      new Counter<'outcome' | 'input'>({
        name: 'chatchat_ai_answers_total',
        help: 'AI питания по изход (answered/no_evidence/ai_unavailable/timeout/error/cancelled) и вход (text/files).',
        labelNames: ['outcome', 'input'],
      }),
    ),
    aiDuration: r(
      new Histogram<'outcome' | 'input'>({
        name: 'chatchat_ai_answer_duration_seconds',
        help: 'Време за AI отговор (търсене + модел + Safety Gate) — NFR-02: P95 ≤ 8 s за текст.',
        labelNames: ['outcome', 'input'],
        buckets: AI_BUCKETS,
      }),
    ),
    gateInterventions: r(
      new Counter<'reason'>({
        name: 'chatchat_safety_gate_interventions_total',
        help: 'Намеси на Safety Gate по причина (кодът gate.*/ai.*; непознат код → other).',
        labelNames: ['reason'],
        maxSeries: 100,
      }),
    ),
    gateLevels: r(
      new Counter<'level'>({
        name: 'chatchat_safety_gate_answers_total',
        help: 'AI отговори по ниво на безопасност след Safety Gate (standard/caution/blocked).',
        labelNames: ['level'],
      }),
    ),
    uploads: r(
      new Counter<'kind' | 'result'>({
        name: 'chatchat_attachment_uploads_total',
        help: 'Качени файлове по вид и резултат (clean/infected/scan_failed/rejected).',
        labelNames: ['kind', 'result'],
      }),
    ),
    avScans: r(
      new Counter<'verdict' | 'reason'>({
        name: 'chatchat_av_scans_total',
        help: 'Проверки на антивируса по присъда (CLEAN/INFECTED/FAILED) и причина за FAILED.',
        labelNames: ['verdict', 'reason'],
      }),
    ),
    avDuration: r(
      new Histogram({
        name: 'chatchat_av_scan_duration_seconds',
        help: 'Продължителност на една проверка в clamd (INSTREAM).',
        buckets: AV_BUCKETS,
      }),
    ),
    sseStreams: r(
      new Gauge({
        name: 'chatchat_sse_streams',
        help: 'Отворени SSE потоци в процеса (GET /api/v1/events).',
      }),
    ),
    realtimeEvents: r(
      new Counter<'type' | 'result'>({
        name: 'chatchat_realtime_events_total',
        help: 'Публикувани събития в реално време по тип и резултат (delivered/no_recipients/error).',
        labelNames: ['type', 'result'],
      }),
    ),
    realtimeDelivery: r(
      new Histogram({
        name: 'chatchat_realtime_delivery_seconds',
        help: 'От публикуване до запис в потоците (опашка + права) — NFR-11: P95 ≤ 2 s.',
        buckets: REALTIME_BUCKETS,
      }),
    ),
    breakerState: r(
      new Gauge<'breaker'>({
        name: 'chatchat_circuit_breaker_state',
        help: 'Състояние на circuit breaker-а: 0 затворен, 1 полуотворен, 2 отворен.',
        labelNames: ['breaker'],
      }),
    ),
    breakerTransitions: r(
      new Counter<'breaker' | 'to'>({
        name: 'chatchat_circuit_breaker_transitions_total',
        help: 'Преходи на circuit breaker-а по целево състояние.',
        labelNames: ['breaker', 'to'],
      }),
    ),
    breakerRejections: r(
      new Counter<'breaker'>({
        name: 'chatchat_circuit_breaker_rejections_total',
        help: 'Заявки, отказани бързо от отворен/полуотворен breaker (без да стигнат до доставчика).',
        labelNames: ['breaker'],
      }),
    ),
    // ── Опашките и worker-ът (NFR-06/07): queue = ingest|ocr|embed|dead; без id-та на задачи.
    queueJobs: r(
      new Counter<'queue' | 'result'>({
        name: 'chatchat_queue_jobs_total',
        help: 'Опити на задачи по опашка и изход (completed/retried/dead).',
        labelNames: ['queue', 'result'],
      }),
    ),
    queueDuration: r(
      new Histogram<'queue'>({
        name: 'chatchat_queue_job_duration_seconds',
        help: 'Продължителност на един опит на задача по опашка.',
        labelNames: ['queue'],
        buckets: JOB_BUCKETS,
      }),
    ),
    queueDepth: r(
      new Gauge<'queue' | 'state'>({
        name: 'chatchat_queue_depth',
        help: 'Задачи по опашка и състояние (waiting/active/delayed/failed) — от Redis, на 15 s.',
        labelNames: ['queue', 'state'],
      }),
    ),
    ingestItems: r(
      new Counter<'format' | 'result'>({
        name: 'chatchat_ingest_items_total',
        help: 'Приети файлове за базата знания по формат (pdf/docx/xlsx/image/log) и изход (done/failed).',
        labelNames: ['format', 'result'],
      }),
    ),
    ocrPages: r(
      new Counter<'result'>({
        name: 'chatchat_ocr_pages_total',
        help: 'Страници през OCR по изход (ok/empty/failed).',
        labelNames: ['result'],
      }),
    ),
    realtimeBus: r(
      new Counter<'direction' | 'kind'>({
        name: 'chatchat_realtime_bus_messages_total',
        help: 'Съобщения между инстанциите (Redis pub/sub) по посока (in/out) и вид.',
        labelNames: ['direction', 'kind'],
      }),
    ),
    // ── Изпращачът към helpdesk (FR-09, §14.4): агрегати по всички клиенти — без tenant, без id.
    helpdeskDeliveries: r(
      new Counter<'result'>({
        name: 'chatchat_helpdesk_deliveries_total',
        help: 'Опити за доставка към helpdesk по изход (delivered/skipped/retry/dead/ssrf_blocked/unrecorded).',
        labelNames: ['result'],
      }),
    ),
    helpdeskOutbox: r(
      new Gauge<'state'>({
        name: 'chatchat_helpdesk_outbox',
        help: 'Редове в outbox-а към helpdesk по състояние (pending/sending; dead — само на включен конектор).',
        labelNames: ['state'],
      }),
    ),
    helpdeskOldestPending: r(
      new Gauge({
        name: 'chatchat_helpdesk_oldest_pending_seconds',
        help: 'Възраст на най-старата недоставена доставка, която не чака зад dead-letter (0 — няма).',
      }),
    ),
  };
  processMetrics(registry);
  return metrics;
}

export type Metrics = ReturnType<typeof createMetrics>;

/** USE за процеса: памет, натоварване на event loop-а, време на старт — смятани при четене. */
function processMetrics(registry: Registry): void {
  const start = registry.register(
    new Gauge({ name: 'process_start_time_seconds', help: 'Старт на процеса (Unix секунди).' }),
  );
  start.set(undefined, Math.round(Date.now() / 1000 - process.uptime()));
  const rss = registry.register(
    new Gauge({ name: 'process_resident_memory_bytes', help: 'Резидентна памет (RSS) в байтове.' }),
  );
  rss.collect = () => rss.set(undefined, process.memoryUsage().rss);
  const heap = registry.register(
    new Gauge({ name: 'nodejs_heap_used_bytes', help: 'Използвана V8 купчина в байтове.' }),
  );
  heap.collect = () => heap.set(undefined, process.memoryUsage().heapUsed);
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const lag = registry.register(
    new Gauge({
      name: 'nodejs_eventloop_delay_p99_seconds',
      help: 'P99 на закъснението на event loop-а от предното четене насам.',
    }),
  );
  lag.collect = () => {
    // Хистограмата е в наносекунди; нулира се при всяко четене (прозорецът = интервала на скрейпа).
    lag.set(undefined, delay.count > 0 ? delay.percentile(99) / 1e9 : 0);
    delay.reset();
  };
}

/** Кодът на решение на Safety Gate като етикет — само познат формат, иначе „other“. */
const GATE_CODE = /^(gate|ai)\.[A-Za-z]+(\.[A-Za-z]+){0,3}$/;
export function gateReason(code: string): string {
  return code.length <= 48 && GATE_CODE.test(code) ? code : 'other';
}
