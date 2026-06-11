import { useCallback, useEffect, useState } from "react";
import {
  SOCKET_EVENTS,
  type GameKey,
  type GameOverMsg,
  type GameStateMsg,
  type MatchFoundMsg,
  type PresenceMsg,
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

    // Adopt a match created elsewhere (a friend invite already populated the
    // store + navigated here) instead of joining the queue again.
    const existing = useMatchStore.getState();
    const adopting =
      existing.matchId !== null && existing.game === gameKey && existing.phase !== "over";

    const onFound = (m: MatchFoundMsg) => {
      setMatchId(m.matchId);
      setSeat(m.seat);
      setPlayers(m.players);
      setPhase("playing");
      // Publish for chrome mounted outside the game view (chat, status).
      useMatchStore.getState().setMatch({ matchId: m.matchId, seat: m.seat, players: m.players, game: m.game });
    };
    const onState = (s: GameStateMsg) => {
      setState(s.state as S);
      setLegal((s.legalActions as A[]) ?? []);
      setTurn(s.turn);
      setTerminal(s.terminal);
      useMatchStore.getState().setLive(s.turn, s.turnEndsAt ?? 0);
    };
    const onOver = (o: GameOverMsg) => {
      setResult(o);
      setPhase("over");
      useMatchStore.getState().setPhase("over");
    };
    const onPresence = (p: PresenceMsg) => {
      // Single active match per client, so apply directly.
      useMatchStore.getState().setPresence(p.seat, p.connected);
    };

    socket.on(SOCKET_EVENTS.MATCH_FOUND, onFound);
    socket.on(SOCKET_EVENTS.GAME_STATE, onState);
    socket.on(SOCKET_EVENTS.GAME_OVER, onOver);
    socket.on(SOCKET_EVENTS.PRESENCE, onPresence);

    const join = () => socket.emit(SOCKET_EVENTS.QUEUE_JOIN, { game: gameKey });
    // On (re)connect: a live match resyncs (the fresh socket re-joined the user
    // room on handshake, but missed any state sent during the gap); only when
    // there is no live match do we (re-)enter the queue — otherwise a mid-match
    // reconnect would leave a stale queue entry behind.
    const onConnect = () => {
      const m = useMatchStore.getState();
      if (m.matchId && m.phase !== "over") {
        socket.emit(SOCKET_EVENTS.GAME_RESYNC, { matchId: m.matchId });
      } else if (!adopting) {
        join();
      }
    };
    if (adopting) {
      // Hydrate from the store and pull the current state; do NOT queue.
      setMatchId(existing.matchId);
      setSeat(existing.seat);
      setPlayers(existing.players);
      setPhase("playing");
      socket.emit(SOCKET_EVENTS.GAME_RESYNC, { matchId: existing.matchId });
    } else if (socket.connected) {
      join();
    }
    socket.on("connect", onConnect);

    return () => {
      if (!adopting) socket.emit(SOCKET_EVENTS.QUEUE_LEAVE);
      socket.off(SOCKET_EVENTS.MATCH_FOUND, onFound);
      socket.off(SOCKET_EVENTS.GAME_STATE, onState);
      socket.off(SOCKET_EVENTS.GAME_OVER, onOver);
      socket.off(SOCKET_EVENTS.PRESENCE, onPresence);
      socket.off("connect", onConnect);
      useMatchStore.getState().clearMatch();
    };
  }, [gameKey]);

  // Stable across renders (changes only with matchId) so effects that auto-act
  // (War/Bingo timers) can safely depend on it without restarting each render.
  const send = useCallback(
    (action: A) => {
      if (matchId) getSocket().emit(SOCKET_EVENTS.GAME_ACTION, { matchId, action });
    },
    [matchId],
  );

  return { phase, matchId, seat, players, state, legal, turn, terminal, result, send };
}
