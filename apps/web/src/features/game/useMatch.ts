import { useEffect, useState } from "react";
import {
  SOCKET_EVENTS,
  type GameKey,
  type GameOverMsg,
  type GameStateMsg,
  type MatchFoundMsg,
} from "@aso/shared";
import { getSocket } from "../../lib/socket";
import { useMatchStore } from "../../lib/store";

export type MatchPhase = "searching" | "playing" | "over";

export interface MatchHandle<S, A> {
  phase: MatchPhase;
  matchId: string | null;
  seat: number;
  players: MatchFoundMsg["players"];
  state: S | null;
  legal: A[];
  turn: number | null;
  terminal: boolean;
  result: GameOverMsg | null;
  send: (action: A) => void;
}

/**
 * Game-agnostic match lifecycle over Socket.IO: joins the queue, tracks the
 * authoritative redacted state, and exposes `send` for actions. Each game view
 * parameterises the state/action types.
 */
export function useMatch<S, A>(gameKey: GameKey | null): MatchHandle<S, A> {
  const [phase, setPhase] = useState<MatchPhase>("searching");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [seat, setSeat] = useState<number>(0);
  const [players, setPlayers] = useState<MatchFoundMsg["players"]>([]);
  const [state, setState] = useState<S | null>(null);
  const [legal, setLegal] = useState<A[]>([]);
  const [turn, setTurn] = useState<number | null>(null);
  const [terminal, setTerminal] = useState(false);
  const [result, setResult] = useState<GameOverMsg | null>(null);

  useEffect(() => {
    if (!gameKey) return;
    const socket = getSocket();
    const matchStore = useMatchStore.getState();

    const onFound = (m: MatchFoundMsg) => {
      setMatchId(m.matchId);
      setSeat(m.seat);
      setPlayers(m.players);
      setPhase("playing");
      // Publish for the chat dock mounted in GameView.
      matchStore.setMatch({ matchId: m.matchId, seat: m.seat, players: m.players });
    };
    const onState = (s: GameStateMsg) => {
      setState(s.state as S);
      setLegal((s.legalActions as A[]) ?? []);
      setTurn(s.turn);
      setTerminal(s.terminal);
    };
    const onOver = (o: GameOverMsg) => {
      setResult(o);
      setPhase("over");
      useMatchStore.getState().setPhase("over");
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
      useMatchStore.getState().clearMatch();
    };
  }, [gameKey]);

  const send = (action: A) => {
    if (matchId) getSocket().emit(SOCKET_EVENTS.GAME_ACTION, { matchId, action });
  };

  return { phase, matchId, seat, players, state, legal, turn, terminal, result, send };
}
