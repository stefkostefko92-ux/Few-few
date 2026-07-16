import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { gameHasCosmetics } from "@aso/shared";
import { Badge, Panel, cn } from "../../ui";
import { useAuthStore, useCosmeticsModal } from "../../lib/store";
import { DailyReward } from "../progression/DailyReward";
import { GAME_CATALOG, gameTitle, type GameCard } from "./games";

function GameTile({ game }: { game: GameCard }) {
  const { t } = useTranslation();
  const openCosmetics = useCosmeticsModal((s) => s.openCosmetics);
  const customizable = game.ready && gameHasCosmetics(game.key);
  const title = gameTitle(t, game.key, game.title);

  return (
    <Panel
      className={cn(
        "group relative flex min-h-40 flex-col justify-between p-5 transition-transform duration-fast ease-snap",
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
        <h2 className="text-xl text-ink-100">{title}</h2>
        {game.ready ? (
          <p className="mt-1 text-xs text-brass-300">{t("lobby.play")} →</p>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">{t("lobby.comingSoon")}</p>
        )}
      </div>

      {customizable ? (
        <button
          type="button"
          title={t("cosmetics.customize")}
          aria-label={t("cosmetics.customize")}
          onClick={(e) => {
            // The tile is wrapped in a Link; don't navigate into the match.
            e.preventDefault();
            e.stopPropagation();
            openCosmetics(game.key);
          }}
          className="absolute right-3 top-12 grid size-8 place-items-center rounded-full border border-brass-400/25 bg-felt-900/70 text-sm opacity-0 transition-opacity hover:border-brass-300 group-hover:opacity-100 focus-visible:opacity-100"
        >
          🎨
        </button>
      ) : null}
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

      {user ? <DailyReward /> : null}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {GAME_CATALOG.map((game) => (
          <li key={game.key}>
            {game.ready ? (
              <Link to={`/play/${game.key.toLowerCase()}`} aria-label={gameTitle(t, game.key, game.title)}>
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
