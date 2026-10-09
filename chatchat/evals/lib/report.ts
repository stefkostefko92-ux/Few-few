import type { CaseScore, Metrics, Ratio } from './metrics.js';

/** Отчетът на един прогон (AC-09): версиите на промпта/правилата + снимката на знанието. */
export interface Report {
  set: { name: string; version: string; fixture: boolean; file: string };
  promptVersion: string;
  knowledgeSnapshotId: string;
  diagnosisModel: string;
  embeddingModel: string | null;
  k: number;
  startedAt: string;
  durationMs: number;
  metrics: Metrics;
  byTag: Record<string, Metrics>;
  cases: CaseScore[];
}

const pct = (r: Ratio) =>
  r.value === null ? '—' : `${(r.value * 100).toFixed(1)} % (${r.num}/${r.den})`;

const ROWS: Array<[keyof Metrics, string]> = [
  ['retrievalHitRate', 'Retrieval hit rate (top-k)'],
  ['citationPrecision', 'Citation precision'],
  ['versionAccuracy', 'Version accuracy'],
  ['escalationPrecision', 'Escalation precision'],
  ['escalationRecall', 'Escalation recall'],
  ['safetyViolationRate', 'Safety violation rate (цел 0)'],
  ['statusAccuracy', 'Answer status accuracy'],
  ['levelAccuracy', 'Evidence level accuracy'],
];

export function renderMarkdown(r: Report): string {
  const lines = [
    `# Оценка „${r.set.name}“ ${r.set.version}`,
    '',
    r.set.fixture
      ? '> Набор от ФИКТИВНИ фикстури — не са данни на клиента.'
      : '> Реален набор на клиента — отчетът не влиза в git.',
    '',
    `- Промпт + правила: \`${r.promptVersion}\``,
    `- Снимка на знанието: \`${r.knowledgeSnapshotId}\``,
    `- Модел: \`${r.diagnosisModel}\` · embeddings: \`${r.embeddingModel ?? 'изключени'}\` · k = ${r.k}`,
    `- Начало: ${r.startedAt} · ${(r.durationMs / 1000).toFixed(1)} s · случаи: ${r.metrics.cases}`,
    '',
    '| Метрика | Стойност |',
    '| --- | --- |',
    ...ROWS.map(([key, label]) => `| ${label} | ${pct(r.metrics[key] as Ratio)} |`),
    '',
    '## По етикет',
    '',
    '| Етикет | Случаи | Hit | Status | Нарушения |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(r.byTag).map(
      ([tag, m]) =>
        `| ${tag} | ${m.cases} | ${pct(m.retrievalHitRate)} | ${pct(m.statusAccuracy)} | ${pct(m.safetyViolationRate)} |`,
    ),
    '',
    '## Случаи',
    '',
    '| Случай | Status | Ниво | Hit | Цитати | Ескалация (очаквана/дадена) | Нарушения |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...r.cases.map(
      (c) =>
        `| ${c.id} | ${c.status}${c.statusOk === false ? ' ✗' : ''} | ${c.level}${c.levelOk === false ? ' ✗' : ''} | ${
          c.retrievalHit === null ? '—' : c.retrievalHit ? 'да' : 'не'
        } | ${c.citations.relevant}/${c.citations.total} | ${c.escalation.expected ?? '—'}/${
          c.escalation.recommended
        } | ${c.violations.join(', ') || '—'} |`,
    ),
    '',
  ];
  return lines.join('\n');
}
