// Метриките на §16.1, които искат експертна истина: само от последния отчет на оценъчния
// набор (`npm run eval`). Без отчет — ясно „изисква оценка“, никога измислено число.

import { t } from '../i18n.js';
import { sectionTitle, tile, tiles } from './kpi-format.js';
import { h } from './ui.js';

const METRICS = [
  { id: 'retrievalHitRate', key: 'retrieval' },
  { id: 'citationPrecision', key: 'citation' },
  { id: 'versionAccuracy', key: 'version' },
  { id: 'escalationPrecision', key: 'escPrecision' },
  { id: 'safetyViolationRate', key: 'safety', tone: 'stop' },
];

export function evalSection(e, f) {
  const out = [sectionTitle(t('admin.kpi.sec.eval'))];
  const accuracy = tile({
    id: 'answerAccuracy',
    label: t('admin.kpi.eval.answerAccuracy'),
    value: h('span', { class: 'kpi-na' }, t('admin.kpi.eval.expert')),
    def: t('admin.kpi.def.eval.answerAccuracy'),
  });
  if (!e) {
    out.push(
      h('p', { class: 'note note-warn' }, t('admin.kpi.eval.none')),
      tiles(
        ...METRICS.map((m) =>
          tile({
            id: `eval-${m.id}`,
            label: t(`admin.kpi.eval.${m.key}`),
            value: h('span', { class: 'kpi-na' }, t('admin.kpi.eval.required')),
            def: t(`admin.kpi.def.eval.${m.key}`),
          }),
        ),
        accuracy,
      ),
    );
    return out;
  }
  out.push(
    h(
      'p',
      { class: 'muted small' },
      t('admin.kpi.eval.meta', {
        name: e.set.name,
        version: e.set.version,
        cases: f.number(e.cases),
        date: f.dateLong(e.startedAt),
        prompt: e.promptVersion,
        model: e.diagnosisModel,
      }),
    ),
  );
  if (e.set.fixture) out.push(h('p', { class: 'note note-warn' }, t('admin.kpi.eval.fixture')));
  if (e.fakeModel) out.push(h('p', { class: 'note note-warn' }, t('admin.kpi.eval.fake')));
  out.push(
    tiles(
      ...METRICS.map((m) => {
        const r = e[m.id];
        return tile({
          id: `eval-${m.id}`,
          label: t(`admin.kpi.eval.${m.key}`),
          value: r.value === null ? '—' : f.pct(r.value),
          sub: t('admin.kpi.ofPlain', { num: f.number(r.num), den: f.number(r.den) }),
          def: t(`admin.kpi.def.eval.${m.key}`),
          tone: m.tone,
        });
      }),
      accuracy,
    ),
  );
  return out;
}
