import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  SOCKET_EVENTS,
  isGameKey,
  type GameOverMsg,
  type GameStateMsg,
  type MatchFoundMsg,
} from "@aso/shared";
import { Badge, Button, Panel } from "../../ui";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../lib/store";
import { GAME_CATALOG } from "../lobby/games";
import { ChessBoard } from "./chess/ChessBoard";
import type { ChessAction, ChessState } from "./chess/types";

type Phase = "searching" | "playing" | "over";

export function GameView() {
  const { game } = useParams<{ game: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const gameKey = game?.toUpperCase();
  const meta = GAME_CATALOG.find((g) => g.key === gameKey);

  const [phase, setPhase] = useState<Phase>("searching");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [seat, setSeat] = useState<number>(0);
  const [opponent, setOpponent] = useState<string>("");
  const [chess, setChess] = useState<ChessState | null>(null);
  const [legal, setLegal] = useState<ChessAction[]>([]);
  const [turn, setTurn] = useState<number | null>(null);
  const [result, setResult] = useState<GameOverMsg | null>(null);

  const playable = gameKey && isGameKey(gameKey) && meta?.ready;

  useEffect(() => {
    if (!playable || !gameKey) return;
    const socket = getSocket();

    const onFound = (m: MatchFoundMsg) => {
      setMatchId(m.matchId);
      setSeat(m.seat);
      setOpponent(m.players.find((p) => p.seat !== m.seat)?.displayName ?? "");
      setPhase("playing");
    };
    const onState = (s: GameStateMsg) => {
      setChess(s.state as ChessState);
      setLegal((s.legalActions as ChessAction[]) ?? []);
      setTurn(s.turn);
    };
    const onOver = (o: GameOverMsg) => {
      setResult(o);
      setPhase("over");
    };

    socket.on(SOCKET_EVENTS.MATCH_FOUND, onFound);
    socket.on(SOCKET_EVENTS.GAME_STATE, onState);
    socket.on(SOCKET_EVENTS.GAME_OVER, onOver);

    const join = () => socket.emit(SOCKET_EVENTS.QUEUE_JOIN, { game: gameKey });
    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.emit(SOCKET_EVENTS.QUEUE_LEAVE);
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onFound);
      socket.off(SOCKET_EVENTS.GAME_STATE, onState);
      socket.off(SOCKET_EVENTS.GAME_OVER, onOver);
      socket.off("connect", join);
    };
  }, [playable, gameKey]);

  function onMove(action: ChessAction) {
    if (!matchId) return;
    getSocket().emit(SOCKET_EVENTS.GAME_ACTION, { matchId, action });
  }

  if (!meta || !playable) {
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

  const myTurn = turn === seat && legal.length > 0;
  const myResult = result?.score.find((s) => s.seat === seat)?.result;
  const myDelta = result?.ratingDeltas[seat] ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-3xl text-brass-300">{meta.title}</h1>
        <Button variant="ghost" onClick={() => navigate("/")}>
          {t("game.leave")}
        </Button>
      </div>

      {phase === "searching" ? (
        <Panel className="flex flex-col items-center gap-4 px-10 py-12">
          <span className="size-8 animate-spin rounded-full border-2 border-brass-300 border-t-transparent" />
          <p className="text-ink-300">{t("game.searching")}</p>
        </Panel>
      ) : null}

      {phase !== "searching" && chess ? (
        <>
          <div className="flex w-full items-center justify-between">
            <Badge tone="felt">{opponent || t("game.opponent")}</Badge>
            <Badge tone={myTurn ? "brass" : "felt"}>
              {phase === "over"
                ? t("game.gameOver")
                : myTurn
                  ? t("game.yourTurn")
                  : t("game.opponentTurn")}
            </Badge>
          </div>

          <ChessBoard
            fen={chess.fen}
            legalActions={legal}
            myTurn={myTurn && phase === "playing"}
            orientation={seat === 1 ? "black" : "white"}
            lastMove={chess.lastMove}
            onMove={onMove}
          />

          <Badge tone="felt">{user?.displayName ?? t("game.you")}</Badge>
        </>
      ) : null}

      {phase === "over" && myResult ? (
        <Panel className="w-full max-w-sm text-center">
          <h2 className="mb-2 text-3xl text-brass-300">
            {myResult === "win"
              ? t("game.youWin")
              : myResult === "loss"
                ? t("game.youLose")
                : t("game.draw")}
          </h2>
          <p className="tnum text-ink-300">
            MMR {myDelta >= 0 ? "+" : ""}
            {myDelta}
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate("/")}>
            {t("game.backToLobby")}
          </Button>
        </Panel>
      ) : null}
    </div>
  );
}
