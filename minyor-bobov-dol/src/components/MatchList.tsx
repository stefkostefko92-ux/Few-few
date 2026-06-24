import { SITE } from "@/lib/site";
import { formatDateShort, formatTime } from "@/lib/format";
import { MATCH_STATUS_LABELS, labelFor } from "@/lib/categories";
import { matchResult, OUTCOME_SHORT, type MatchLike } from "@/lib/match";

const OUTCOME_STYLE: Record<string, string> = {
  WIN: "bg-green-600 text-white",
  DRAW: "bg-slate-400 text-white",
  LOSS: "bg-crimson-600 text-white",
};

// Един ред с мач — резултат (за изиграни) или час (за предстоящи).
function MatchRow({ match }: { match: MatchLike }) {
  const home = match.isHome ? SITE.shortName : match.opponent;
  const away = match.isHome ? match.opponent : SITE.shortName;
  const { ours, theirs, outcome } = matchResult(match);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="w-20 shrink-0 text-sm text-slate-500">
        <div className="font-semibold text-slate-700">
          {formatDateShort(match.kickoff)}
        </div>
        <div>{match.round ?? labelFor(MATCH_STATUS_LABELS, match.status)}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-center gap-3 text-center">
          <span className="flex-1 truncate text-right font-medium text-slate-800">
            {home}
          </span>
          {outcome ? (
            <span
              className={
                "shrink-0 rounded-md px-2.5 py-1 text-sm font-bold tabular-nums " +
                "bg-brand-900 text-white"
              }
            >
              {match.isHome ? ours : theirs} : {match.isHome ? theirs : ours}
            </span>
          ) : (
            <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-600 tabular-nums">
              {formatTime(match.kickoff)}
            </span>
          )}
          <span className="flex-1 truncate text-left font-medium text-slate-800">
            {away}
          </span>
        </div>
      </div>

      <div className="w-8 shrink-0 text-center">
        {outcome && (
          <span
            className={
              "inline-grid h-7 w-7 place-items-center rounded-full text-xs font-bold " +
              OUTCOME_STYLE[outcome]
            }
            title={labelFor(MATCH_STATUS_LABELS, match.status)}
          >
            {OUTCOME_SHORT[outcome]}
          </span>
        )}
      </div>
    </li>
  );
}

export function MatchList({ matches }: { matches: MatchLike[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {matches.map((m) => (
        <MatchRow key={m.id} match={m} />
      ))}
    </ul>
  );
}
