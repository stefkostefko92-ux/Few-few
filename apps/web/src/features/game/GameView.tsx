import { lazy, Suspense, type ComponentType } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buyInFor, isGameKey, type GameKey } from "@aso/shared";
import { Button, Panel } from "../../ui";
import { useAuthStore, useMatchStore } from "../../lib/store";
import { GAME_CATALOG } from "../lobby/games";
import { CinematicStage } from "./cinematic/CinematicStage";
import { ChatDock } from "./chat/ChatDock";
import { MatchStatus } from "./MatchStatus";
import { ReclaimBanner } from "./ReclaimBanner";
import { OutOfChips } from "./OutOfChips";

// Game views pull in heavy WebGL/3D scene code (three.js). Lazy-load them so the
// lobby/shell bundle stays small; each game's chunk loads only when entered.
type ViewProps = { title: string };
const titled = (p: Promise<Record<string, ComponentType<ViewProps>>>, name: string) =>
  lazy(() => p.then((m) => ({ default: m[name]! })));

const ChessView = titled(import("./chess/ChessView"), "ChessView");
const SantaseView = titled(import("./santase/SantaseView"), "SantaseView");
const BeloteView = titled(import("./belote/BeloteView"), "BeloteView");
const SvaraView = titled(import("./svara/SvaraView"), "SvaraView");
const KentView = titled(import("./kent/KentView"), "KentView");
const BridgeView = titled(import("./bridge/BridgeView"), "BridgeView");
const WarView = titled(import("./war/WarView"), "WarView");
const RummyView = titled(import("./rummy/RummyView"), "RummyView");
const GoFishView = titled(import("./gofish/GoFishView"), "GoFishView");
const DraughtsView = titled(import("./draughts/DraughtsView"), "DraughtsView");
const BackgammonView = titled(import("./backgammon/BackgammonView"), "BackgammonView");
const LudoView = titled(import("./ludo/LudoView"), "LudoView");
const BattleshipView = titled(import("./battleship/BattleshipView"), "BattleshipView");
const DiceView = titled(import("./dice/DiceView"), "DiceView");
const BingoView = titled(import("./bingo/BingoView"), "BingoView");
const WordsView = titled(import("./words/WordsView"), "WordsView");
const DominoView = titled(import("./domino/DominoView"), "DominoView");
const MagnatView = titled(import("./magnat/MagnatView"), "MagnatView");
const GenericGameView = lazy(() =>
  import("./generic/GenericGameView").then((m) => ({ default: m.GenericGameView })),
);
const CueView = lazy(() => import("./cue-sports/CueView").then((m) => ({ default: m.CueView })));

type Tone = "warm" | "midnight" | "cool" | "default";

/** Cinematic ambient tone per game, matching its felt/scene mood. */
const TONE: Partial<Record<GameKey, Tone>> = {
  SANTASE: "warm",
  WAR: "midnight",
  SVARA: "midnight",
  BATTLESHIP: "cool",
  GOFISH: "cool",
  EIGHTBALL: "midnight",
  NINEBALL: "midnight",
  SNOOKER: "midnight",
};

function renderGame(gameKey: GameKey, title: string) {
  switch (gameKey) {
    case "CHESS":
      return <ChessView title={title} />;
    case "SANTASE":
      return <SantaseView title={title} />;
    case "BELOTE":
      return <BeloteView title={title} />;
    case "SVARA":
      return <SvaraView title={title} />;
    case "KENT":
      return <KentView title={title} />;
    case "BRIDGE":
      return <BridgeView title={title} />;
    case "WAR":
      return <WarView title={title} />;
    case "RUMMY":
      return <RummyView title={title} />;
    case "GOFISH":
      return <GoFishView title={title} />;
    case "DRAUGHTS":
      return <DraughtsView title={title} />;
    case "BACKGAMMON":
      return <BackgammonView title={title} />;
    case "LUDO":
      return <LudoView title={title} />;
    case "BATTLESHIP":
      return <BattleshipView title={title} />;
    case "DICE":
      return <DiceView title={title} />;
    case "BINGO":
      return <BingoView title={title} />;
    case "WORDS":
      return <WordsView title={title} />;
    case "DOMINO":
      return <DominoView title={title} />;
    case "EIGHTBALL":
    case "NINEBALL":
    case "SNOOKER":
      return <CueView title={title} game={gameKey} />;
    case "MAGNAT":
      return <MagnatView title={title} />;
    default:
      return <GenericGameView title={title} game={gameKey} />;
  }
}

/** Dispatches to a bespoke per-game view, wrapped in the cinematic stage. */
export function GameView() {
  const { game } = useParams<{ game: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // "Play again" bumps the epoch; keying the stage remounts the game view, so
  // useMatch cleanly re-enters the queue for a fresh match.
  const epoch = useMatchStore((s) => s.epoch);

  const gameKey = game?.toUpperCase();
  const meta = GAME_CATALOG.find((g) => g.key === gameKey);
  const playable = !!gameKey && isGameKey(gameKey) && !!meta?.ready;

  if (!meta || !playable || !gameKey) {
    return (
      <div className="mx-auto max-w-md text-center">
        <Panel>
          <h1 className="mb-2 text-2xl text-brass-300">{meta?.title ?? game}</h1>
          <p className="text-ink-300">{t("lobby.comingSoon")}</p>
          <Button variant="felt" className="mt-6" onClick={() => navigate("/")}>
            {t("game.backToLobby")}
          </Button>
        </Panel>
      </div>
    );
  }

  const key = gameKey as GameKey;

  // Gate betting tables: don't seat a player who can't cover the buy-in.
  const buyIn = buyInFor(key);
  if (buyIn !== undefined && user && Number(user.chips) < buyIn) {
    return <OutOfChips minBuyIn={buyIn} chips={Number(user.chips)} />;
  }

  return (
    <CinematicStage key={epoch} tone={TONE[key] ?? "default"}>
      <Suspense
        fallback={
          <p className="py-16 text-center text-ink-muted" aria-live="polite">
            {t("common.loading")}
          </p>
        }
      >
        {renderGame(key, meta.title)}
      </Suspense>
      <MatchStatus />
      <ReclaimBanner />
      <ChatDock />
    </CinematicStage>
  );
}
