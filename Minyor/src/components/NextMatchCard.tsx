import Link from "next/link";
import { CalendarDays, Clock, MapPin, Ticket } from "@/components/icons";
import { SITE } from "@/lib/site";
import { formatDate, formatTime, formatWeekday } from "@/lib/format";
import type { MatchLike } from "@/lib/match";

// Открояваща карта за следващия предстоящ мач — в клубните цветове.
export function NextMatchCard({ match }: { match: MatchLike }) {
  const home = match.isHome ? SITE.shortName : match.opponent;
  const away = match.isHome ? match.opponent : SITE.shortName;
  const ticket = match.ticketUrl;

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-800 bg-brand-900 text-white shadow-lg">
      <div className="flex items-center justify-between bg-gold-400 px-5 py-2 text-brand-900">
        <span className="text-xs font-bold uppercase tracking-wider">Следващ мач</span>
        {match.competition && (
          <span className="text-xs font-semibold">{match.competition}</span>
        )}
      </div>
      <div className="p-6">
        <div className="flex items-center justify-center gap-4 text-center">
          <div className="flex-1">
            <p className="text-lg font-bold leading-tight">{home}</p>
            <p className="text-xs text-slate-400">домакин</p>
          </div>
          <div className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm font-bold text-gold-400">
            срещу
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold leading-tight">{away}</p>
            <p className="text-xs text-slate-400">гост</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-2 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
            <dt className="sr-only">Дата</dt>
            <dd className="capitalize">
              {formatWeekday(match.kickoff)}, {formatDate(match.kickoff)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
            <dt className="sr-only">Начален час</dt>
            <dd>{formatTime(match.kickoff)} ч.</dd>
          </div>
          {match.venue && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
              <dt className="sr-only">Стадион</dt>
              <dd>{match.venue}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/programa" className="btn-gold">
            Цялата програма
          </Link>
          {ticket && (
            <a
              href={ticket}
              target="_blank"
              rel="noopener noreferrer"
              className="btn border border-white/30 text-white hover:bg-white/10"
            >
              <Ticket className="h-4 w-4" aria-hidden />
              Билети
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
