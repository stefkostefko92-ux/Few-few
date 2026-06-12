/**
 * Dev-only fake Socket.IO client for the showcase (aliased over ./socket by
 * vite.showcase.config). On QUEUE_JOIN it answers with MATCH_FOUND + a redacted
 * GAME_STATE built from the real engine, so every game view renders a faithful
 * table with no live server. Same surface as the real socket (on/off/emit).
 */
import { SOCKET_EVENTS, isGameKey, type GameKey } from "@aso/shared";
import { buildFixture } from "../dev/matchFixtures";

type Handler = (payload: unknown) => void;

class FakeSocket {
  connected = true;
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, cb: Handler): this {
    (this.handlers.get(event) ?? this.handlers.set(event, new Set()).get(event)!).add(cb);
    return this;
  }
  off(event: string, cb: Handler): this {
    this.handlers.get(event)?.delete(cb);
    return this;
  }
  private fire(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((cb) => cb(payload));
  }

  emit(event: string, payload?: unknown): this {
    if (event === SOCKET_EVENTS.QUEUE_JOIN) {
      const game = (payload as { game?: string } | undefined)?.game;
      if (game && isGameKey(game)) this.deal(game);
    } else if (event === SOCKET_EVENTS.GAME_RESYNC) {
      const id = (payload as { matchId?: string } | undefined)?.matchId;
      const game = id?.replace("demo-", "");
      if (game && isGameKey(game)) this.deal(game);
    }
    return this;
  }

  private deal(game: GameKey): void {
    const fx = buildFixture(game);
    setTimeout(() => {
      this.fire(SOCKET_EVENTS.MATCH_FOUND, {
        matchId: fx.matchId,
        game: fx.game,
        seat: fx.seat,
        players: fx.players,
      });
      this.fire(SOCKET_EVENTS.GAME_STATE, {
        matchId: fx.matchId,
        state: fx.state,
        legalActions: fx.legalActions,
        turn: fx.turn,
        terminal: false,
      });
    }, 0);
  }

  disconnect(): void {
    this.connected = false;
  }
}

let socket: FakeSocket | null = null;

export function getSocket(): FakeSocket {
  return (socket ??= new FakeSocket());
}

export function disconnectSocket(): void {
  socket = null;
}
