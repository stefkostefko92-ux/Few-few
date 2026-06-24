export type StandingLike = {
  id: string;
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOwnTeam: boolean;
};

// Таблица на класирането със скъсени заглавия на колоните (със заглавия за
// екранни четци) и откроен собствен отбор.
export function StandingsTable({ rows }: { rows: StandingLike[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Класиране в групата</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
          <tr>
            <th scope="col" className="p-3 text-center" title="Позиция">#</th>
            <th scope="col" className="p-3">Отбор</th>
            <th scope="col" className="p-3 text-center" title="Изиграни мачове">М</th>
            <th scope="col" className="p-3 text-center" title="Победи">П</th>
            <th scope="col" className="p-3 text-center" title="Равенства">Р</th>
            <th scope="col" className="p-3 text-center" title="Загуби">З</th>
            <th scope="col" className="p-3 text-center" title="Голова разлика">ГР</th>
            <th scope="col" className="p-3 text-center font-bold" title="Точки">Т</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r.id}
              className={
                r.isOwnTeam ? "bg-gold-50 font-semibold text-brand-900" : "text-slate-700"
              }
            >
              <td className="p-3 text-center tabular-nums">{r.position}</td>
              <td className="p-3">
                <span className="flex items-center gap-2">
                  {r.isOwnTeam && (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500"
                      aria-hidden
                    />
                  )}
                  {r.teamName}
                </span>
              </td>
              <td className="p-3 text-center tabular-nums">{r.played}</td>
              <td className="p-3 text-center tabular-nums">{r.won}</td>
              <td className="p-3 text-center tabular-nums">{r.drawn}</td>
              <td className="p-3 text-center tabular-nums">{r.lost}</td>
              <td className="p-3 text-center tabular-nums">
                {r.goalsFor}:{r.goalsAgainst}
              </td>
              <td className="p-3 text-center font-bold tabular-nums">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
