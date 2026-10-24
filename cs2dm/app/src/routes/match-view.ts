import type { MatchListRow } from '../data/repo.js';
import type { Translator } from '../i18n.js';

/** Колко минути е траял мачът (поне 1). */
export function matchMinutes(row: Pick<MatchListRow, 'startedAt' | 'endedAt'>): number {
  return Math.max(1, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000));
}

/** Редът в списъка с мачове: продължителност и името на първия или „скрит играч“ (чл. 21 GDPR). */
export function matchListView(row: MatchListRow, t: Translator) {
  return {
    ...row,
    minutes: matchMinutes(row),
    topName: row.top ? (row.top.name ?? t('match.hiddenPlayer')) : null,
  };
}
