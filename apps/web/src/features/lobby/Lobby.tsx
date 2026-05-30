import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge, Panel, cn } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { GAME_CATALOG, type GameCard } from "./games";

function GameTile({ game }: { game: GameCard }) {
  const { t } = useTranslation();
  return (
    <Panel
      className={cn(
        "group relative flex h-40 flex-col justify-between p-5 transition-transform duration-fast ease-snap",
        game.ready ? "hover:-translate-y-1" : "opacity-70",
      )}
    >
      <div className="flex items-start justify-between">
        <span aria-hidden className="text-3xl text-brass-300">
          {game.glyph}
        </span>
        <Badge tone="felt" className="tnum">
          {game.players}
        </Badge>
      </div>
      <div>
        <h2 className="text-xl text-ink-100">{game.title}</h2>
        {game.ready ? (
          <p className="mt-1 text-xs text-brass-300">{t("lobby.play")} →</p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">{t("lobby.comingSoon")}</p>
        )}
      </div>
    </Panel>
  );
}

export function Lobby() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl text-brass-300">{t("lobby.title")}</h1>
        {user ? (
          <p className="mt-1 text-ink-300">{t("lobby.welcome", { name: user.displayName })}</p>
        ) : null}
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {GAME_CATALOG.map((game) => (
          <li key={game.key}>
            {game.ready ? (
              <Link to={`/play/${game.key.toLowerCase()}`} aria-label={game.title}>
                <GameTile game={game} />
              </Link>
            ) : (
              <GameTile game={game} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
