import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isGameKey, type GameKey } from "@aso/shared";
import { Button, Panel } from "../../ui";
import { GAME_CATALOG } from "../lobby/games";
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
import { GenericGameView } from "./generic/GenericGameView";

/** Dispatches to a bespoke per-game view, falling back to the generic view. */
export function GameView() {
  const { game } = useParams<{ game: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

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

  switch (gameKey) {
    case "CHESS":
      return <ChessView title={meta.title} />;
    case "SANTASE":
      return <SantaseView title={meta.title} />;
    case "BELOTE":
      return <BeloteView title={meta.title} />;
    case "SVARA":
      return <SvaraView title={meta.title} />;
    case "HOLDEM":
      return <HoldemView title={meta.title} />;
    case "KENT":
      return <KentView title={meta.title} />;
    case "BRIDGE":
      return <BridgeView title={meta.title} />;
    case "WAR":
      return <WarView title={meta.title} />;
    case "RUMMY":
      return <RummyView title={meta.title} />;
    case "GOFISH":
      return <GoFishView title={meta.title} />;
    case "DRAUGHTS":
      return <DraughtsView title={meta.title} />;
    case "BACKGAMMON":
      return <BackgammonView title={meta.title} />;
    case "LUDO":
      return <LudoView title={meta.title} />;
    case "BATTLESHIP":
      return <BattleshipView title={meta.title} />;
    case "DICE":
      return <DiceView title={meta.title} />;
    case "BINGO":
      return <BingoView title={meta.title} />;
    case "WORDS":
      return <WordsView title={meta.title} />;
    default:
      return <GenericGameView title={meta.title} game={gameKey as GameKey} />;
  }
}
