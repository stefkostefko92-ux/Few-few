import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeaderboardEntry } from "@aso/shared";
import { Badge, Panel, cn } from "../../ui";
import { api } from "../../lib/api";
import { GAME_CATALOG } from "../lobby/games";

const READY_GAMES = GAME_CATALOG.filter((g) => g.ready);

export function Leaderboard() {
  const { t } = useTranslation();
  const [game, setGame] = useState(READY_GAMES[0]?.key ?? "CHESS");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .leaderboard(game)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [game]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-4xl text-brass-300">{t("nav.leaderboard")}</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {READY_GAMES.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGame(g.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-fast",
              g.key === game ? "bg-brass-400 text-charcoal-900" : "bg-felt-700 text-ink-300 hover:text-ink-100",
            )}
          >
            {g.title}
          </button>
        ))}
      </div>

      <Panel className="p-0">
        {loading ? (
          <p className="p-8 text-center text-ink-muted">{t("common.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">{t("leaderboard.empty")}</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li
                key={e.userId}
                className="flex items-center justify-between border-b border-brass-400/10 px-6 py-3 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Badge tone={e.rank <= 3 ? "brass" : "felt"} className="tnum w-8 shrink-0 justify-center">
                    {e.rank}
                  </Badge>
                  <span className="min-w-0 truncate text-ink-100">{e.displayName}</span>
                </div>
                <span className="tnum shrink-0 pl-3 text-brass-300">{e.rating}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
