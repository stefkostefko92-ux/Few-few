import type { MatchHighlights, MatchListRow, MatchName } from '../data/repo.js';
import { MULTI_KILL_GAP_MS, formatOffset } from '../highlights.js';
import { LOCALE_TAG, type Locale, type Translator } from '../i18n.js';
import { weaponLabel } from '../mastery.js';

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

/** Колко серии показваме на картата на мача (най-дългите първи). */
export const HIGHLIGHT_MULTI_MAX = 10;

/** Хайлайтите за изгледа: скрит играч → „скрит играч“ без линк, време от началото, имена на оръжия. */
export function highlightsView(data: MatchHighlights, t: Translator, locale: Locale) {
  const meters = new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 1 });
  const who = (person: MatchName) => ({
    steamId: person.steamId,
    name: person.name ?? t('match.hiddenPlayer'),
  });
  return {
    recorded: data.recorded,
    gapSeconds: MULTI_KILL_GAP_MS / 1000,
    multiKills: data.multiKills.slice(0, HIGHLIGHT_MULTI_MAX).map((run) => ({
      ...who(run),
      kind: t('highlights.multi.kind', { kills: run.kills }),
      time: formatOffset(run.offsetMs),
      weapons: [...new Set(run.weapons.map(weaponLabel))].join(', '),
    })),
    collections: data.collections.map((line) => ({
      kind: line.kind,
      count: line.count,
      leader: who(line.leader),
      leaderCount: line.leaderCount,
    })),
    longest: data.longest
      ? {
          ...who(data.longest),
          weapon: weaponLabel(data.longest.weapon),
          meters: meters.format(data.longest.meters),
          time: formatOffset(data.longest.offsetMs),
        }
      : null,
  };
}
