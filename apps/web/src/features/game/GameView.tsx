import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isGameKey, type GameKey } from "@aso/shared";
import { Button, Panel } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { GAME_CATALOG } from "../lobby/games";
import { CinematicStage } from "./cinematic/CinematicStage";
import { ChatDock } from "./chat/ChatDock";
import { MatchStatus } from "./MatchStatus";
import { OutOfChips } from "./OutOfChips";
import { ChessView } from "./chess/ChessView";
import { SantaseView } from "./santase/SantaseView";
import { BeloteView } from "./belote/BeloteView";
import { SvaraView } from "./svara/SvaraView";
import { HoldemView } from "./holdem/HoldemView";
import { KentView } from "./kent/KentView";
import { BridgeView } from "./bridge/BridgeView";
import { WarView } from "./war/WarView";
import { RummyView } from "./rummy/RummyView";
import { GoFishView } from "./gofish/GoFishView";
import { DraughtsView } from "./draughts/DraughtsView";
import { BackgammonView } from "./backgammon/BackgammonView";
import { LudoView } from "./ludo/LudoView";
import { BattleshipView } from "./battleship/BattleshipView";
import { DiceView } from "./dice/DiceView";
import { BingoView } from "./bingo/BingoView";
import { WordsView } from "./words/WordsView";
import { DominoView } from "./domino/DominoView";
import { GenericGameView } from "./generic/GenericGameView";

type Tone = "warm" | "midnight" | "cool" | "default";

/** Cinematic ambient tone per game, matching its felt/scene mood. */
const TONE: Partial<Record<GameKey, Tone>> = {
  SANTASE: "warm",
  WAR: "midnight",
  SVARA: "midnight",
  HOLDEM: "midnight",
  BATTLESHIP: "cool",
  GOFISH: "cool",
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
    case "HOLDEM":
      return <HoldemView title={title} />;
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
    default:
      return <GenericGameView title={title} game={gameKey} />;
  }
}

/** Chip-wagering games and the chips needed to sit down (§11.4 virtual only). */
const CHIP_BUYIN: Partial<Record<GameKey, number>> = {
  SVARA: 200,
  HOLDEM: 200,
};

/** Dispatches to a bespoke per-game view, wrapped in the cinematic stage. */
export function GameView() {
  const { game } = useParams<{ game: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

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
  const buyIn = CHIP_BUYIN[key];
  if (buyIn !== undefined && user && Number(user.chips) < buyIn) {
    return <OutOfChips minBuyIn={buyIn} chips={Number(user.chips)} />;
  }

  return (
    <CinematicStage tone={TONE[key] ?? "default"}>
      {renderGame(key, meta.title)}
      <MatchStatus />
      <ChatDock />
    </CinematicStage>
  );
}
