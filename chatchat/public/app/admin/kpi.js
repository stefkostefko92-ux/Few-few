// KPI (§16.1, GET /admin/kpi): плочки, прости SVG графики с таблица-алтернатива и обяснение на
// всяка метрика. Само агрегати на клиента — без разбивка по човек; „<5“ идва от сървъра
// (k-анонимност, чл. 4 Statuto dei Lavoratori) и UI не го „допълва“.

import { tCode, t } from '../i18n.js';
import { call, query } from './core.js';
import { barTable, cellNode, seriesChart } from './kpi-charts.js';
import { evalSection } from './kpi-eval.js';
import { formatters, ofTotal, rateValue, sectionTitle, tile, tiles } from './kpi-format.js';
import { clear, failure, field, h, input, loading, sectionHead, select } from './ui.js';

const PRESETS = ['7', '30', '90', '365'];
const DAY = 86_400_000;
const LEVELS = ['strong', 'high', 'weak', 'conflict', 'none'];
const RATINGS = ['USEFUL', 'NOT_USEFUL', 'TECHNICAL_ERROR'];

/** Началото на локалния ден като ISO; `plusDays` — за изключващата горна граница. */
function dayIso(value, plusDays = 0) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).toISOString();
}

function casesBlock(k, f) {
  const c = k.cases;
  const ttr = k.timeToResolution;
  const esc = k.escalation;
  return [
    sectionTitle(t('admin.kpi.sec.cases')),
    h('p', { class: 'muted small' }, `${t('admin.kpi.casesTotal')}: `, cellNode(c.total, f.number)),
    tiles(
      tile({
        id: 'ttr',
        label: t('admin.kpi.ttr'),
        value:
          ttr.medianSeconds !== null
            ? f.duration(ttr.medianSeconds)
            : ttr.n === 0
              ? '—'
              : cellNode(ttr.n, f.number),
        sub: h(
          'span',
          {},
          `${t('admin.kpi.ttr.p90')} ${f.duration(ttr.p90Seconds)} · ${t('admin.kpi.ttr.n')} `,
          cellNode(ttr.n, f.number),
        ),
        def: t('admin.kpi.def.ttr'),
      }),
      tile({
        id: 'fcr',
        label: t('admin.kpi.fcr'),
        value: rateValue(k.firstContactResolution, f),
        sub: ofTotal(k.firstContactResolution, f),
        def: t('admin.kpi.def.fcr'),
      }),
      tile({
        id: 'esc',
        label: t('admin.kpi.esc'),
        value: rateValue(esc.rate, f),
        sub: ofTotal(esc.rate, f),
        def: t('admin.kpi.def.esc'),
      }),
      tile({
        id: 'takeover',
        label: t('admin.kpi.takeover'),
        value: rateValue(esc.takeover, f),
        sub: ofTotal(esc.takeover, f),
        def: t('admin.kpi.def.takeover'),
      }),
    ),
  ];
}

function answersBlock(k, f) {
  const a = k.answers;
  const fb = k.feedback;
  const total = typeof a.total === 'number' ? a.total : null;
  return [
    sectionTitle(t('admin.kpi.sec.answers')),
    h('p', { class: 'note' }, t('admin.kpi.safetyNote')),
    tiles(
      tile({
        id: 'noEvidence',
        label: t('admin.kpi.noEvidence'),
        value: rateValue(a.noEvidence, f),
        sub: ofTotal(a.noEvidence, f),
        def: t('admin.kpi.def.noEvidence'),
      }),
      tile({
        id: 'stepsRemoved',
        label: t('admin.kpi.stepsRemoved'),
        value: rateValue(a.stepsRemoved, f),
        sub: ofTotal(a.stepsRemoved, f),
        def: t('admin.kpi.def.stepsRemoved'),
        tone: 'stop',
      }),
      tile({
        id: 'blocked',
        label: t('admin.kpi.blocked'),
        value: rateValue(a.blocked, f),
        sub: ofTotal(a.blocked, f),
        def: t('admin.kpi.def.blocked'),
        tone: 'stop',
      }),
      tile({
        id: 'technicalError',
        label: t('admin.kpi.technicalError'),
        value: rateValue(fb.technicalError, f),
        sub: ofTotal(fb.technicalError, f),
        def: t('admin.kpi.def.technicalError'),
        tone: 'stop',
      }),
      tile({
        id: 'useful',
        label: t('admin.kpi.useful'),
        value: rateValue(fb.useful, f),
        sub: ofTotal(fb.useful, f),
        def: t('admin.kpi.def.useful'),
      }),
      tile({
        id: 'coverage',
        label: t('admin.kpi.coverage'),
        value: rateValue(fb.coverage, f),
        sub: ofTotal(fb.coverage, f),
        def: t('admin.kpi.def.coverage'),
      }),
    ),
    h(
      'div',
      { class: 'kpi-charts' },
      barTable({
        caption: t('admin.kpi.chart.evidence'),
        items: LEVELS.map((l) => ({ label: t(`ans.level.${l}`), cell: a.evidence[l] })),
        total,
        fmtNumber: f.number,
        fmtPct: f.pct,
      }),
      barTable({
        caption: t('admin.kpi.chart.feedback'),
        items: RATINGS.map((r) => ({ label: t(`fb.rating.${r}`), cell: fb.ratings[r] })),
        total: typeof fb.total === 'number' ? fb.total : null,
        fmtNumber: f.number,
        fmtPct: f.pct,
      }),
      barTable({
        wide: true,
        caption: t('admin.kpi.chart.reasons'),
        items: Object.entries(a.removalReasons).map(([code, cell]) => ({
          label: tCode(code),
          cell,
        })),
        total,
        fmtNumber: f.number,
        fmtPct: f.pct,
      }),
      barTable({
        caption: t('admin.kpi.chart.escSource'),
        items: [
          { label: t('admin.kpi.esc.ai'), cell: k.escalation.byAiRecommendation },
          { label: t('admin.kpi.esc.tech'), cell: k.escalation.byTechnicianDecision },
        ],
        total: typeof k.escalation.rate.num === 'number' ? k.escalation.rate.num : null,
        fmtNumber: f.number,
        fmtPct: f.pct,
      }),
    ),
  ];
}

export function mount(root) {
  const state = { serial: 0, models: [] };
  const results = h('div', { class: 'kpi', 'aria-live': 'polite' });
  const preset = select(
    [
      ...PRESETS.map((p) => ({ value: p, label: t(`admin.kpi.preset.${p}`) })),
      { value: 'custom', label: t('admin.kpi.preset.custom') },
    ],
    '30',
  );
  const from = input({ type: 'date' });
  const to = input({ type: 'date' });
  const model = select([{ value: '', label: t('admin.kpi.allModels') }], '');
  const custom = h(
    'div',
    { class: 'kpi-custom', hidden: true },
    field(t('admin.kpi.from'), from),
    field(t('admin.kpi.to'), to),
  );

  const range = () => {
    if (preset.value !== 'custom') {
      const end = new Date();
      return {
        from: new Date(end.getTime() - Number(preset.value) * DAY).toISOString(),
        to: end.toISOString(),
      };
    }
    if (!from.value || !to.value) return null;
    return { from: dayIso(from.value), to: dayIso(to.value, 1) };
  };

  const fillModels = (models) => {
    if (models.join('|') === state.models.join('|')) return;
    state.models = models;
    const keep = model.value;
    clear(model).append(
      h('option', { value: '' }, t('admin.kpi.allModels')),
      ...models.map((m) => h('option', { value: m }, m)),
    );
    model.value = models.includes(keep) ? keep : '';
  };

  async function load() {
    const r = range();
    if (!r) return;
    const mine = ++state.serial;
    clear(results).append(loading());
    try {
      const k = await call('GET', `/admin/kpi${query({ ...r, model: model.value })}`);
      if (mine !== state.serial) return;
      fillModels(k.models ?? []);
      const f = formatters();
      clear(results).append(
        h(
          'p',
          { class: 'kpi-period muted small' },
          t('admin.kpi.range', {
            from: f.dateLong(k.period.from),
            // Горната граница е изключваща — показваме последния включен момент.
            to: f.dateLong(new Date(Date.parse(k.period.to) - 1).toISOString()),
          }),
          ' · ',
          t('admin.kpi.cohort'),
        ),
        ...casesBlock(k, f),
        seriesChart({
          caption: t(`admin.kpi.chart.series.${k.period.bucket}`),
          series: k.series,
          fmtDate: f.date,
          fmtNumber: f.number,
        }),
        ...answersBlock(k, f),
        ...evalSection(k.evaluation, f),
      );
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }

  preset.addEventListener('change', () => {
    custom.hidden = preset.value !== 'custom';
    void load();
  });
  for (const el of [from, to, model]) el.addEventListener('change', () => void load());

  root.append(
    sectionHead(t('admin.nav.kpi')),
    h('p', { class: 'muted lead' }, t('admin.kpi.lead')),
    h('p', { class: 'note' }, t('admin.kpi.anonNote', { k: 5 })),
    h(
      'div',
      { class: 'toolbar toolbar-wrap' },
      field(t('admin.kpi.period'), preset),
      field(t('admin.kpi.model'), model),
    ),
    custom,
    results,
  );
  void load();
  return () => {
    state.serial += 1;
  };
}
