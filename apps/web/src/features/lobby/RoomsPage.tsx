import { useEffect, useState } from "react";
import {
  SOCKET_EVENTS,
  type GameKey,
  type LobbyListEntry,
  type LobbyListResultMsg,
  type LobbyVisibility,
} from "@aso/shared";
import { Button, Panel } from "../../ui";
import { getSocket } from "../../lib/socket";
import { useLobbyStore } from "../../lib/store";
import { GAME_CATALOG } from "./games";
import { lobbyActions } from "./lobbyActions";
import { RoomView } from "./RoomView";

const READY_GAMES = GAME_CATALOG.filter((g) => g.ready);

export function RoomsPage() {
  const lobby = useLobbyStore((s) => s.lobby);
  const [game, setGame] = useState<GameKey>((READY_GAMES[0]?.key ?? "CHESS") as GameKey);
  const [visibility, setVisibility] = useState<LobbyVisibility>("public");
  const [list, setList] = useState<LobbyListEntry[]>([]);

  // Live public-room browser (poll while not in a room).
  useEffect(() => {
    if (lobby) return;
    const socket = getSocket();
    const onList = (msg: LobbyListResultMsg) => setList(msg.lobbies);
    socket.on(SOCKET_EVENTS.LOBBY_LIST_RESULT, onList);
    lobbyActions.list();
    const id = setInterval(() => lobbyActions.list(), 3000);
    return () => {
      clearInterval(id);
      socket.off(SOCKET_EVENTS.LOBBY_LIST_RESULT, onList);
    };
  }, [lobby]);

  if (lobby) return <RoomView lobby={lobby} />;

  const titleOf = (k: GameKey) => GAME_CATALOG.find((g) => g.key === k)?.title ?? k;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-4xl text-brass-300">Стаи</h1>

      {/* Create */}
      <Panel className="mb-6">
        <h2 className="mb-3 text-lg text-ink-300">Създай стая</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Игра</span>
            <select
              value={game}
              onChange={(e) => setGame(e.target.value as GameKey)}
              className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-ink-100"
            >
              {READY_GAMES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.title} ({g.players})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Видимост</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as LobbyVisibility)}
              className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-ink-100"
            >
              <option value="public">Публична</option>
              <option value="private">Частна (само с покана)</option>
            </select>
          </label>
          <Button onClick={() => lobbyActions.create(game, visibility)}>Създай</Button>
        </div>
      </Panel>

      {/* Browse public rooms */}
      <Panel>
        <h2 className="mb-3 text-lg text-ink-300">Публични стаи</h2>
        {list.length === 0 ? (
          <p className="text-ink-muted">Няма отворени публични стаи. Създай първата!</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-card border border-brass-400/15 bg-felt-900/50 px-3 py-2"
              >
                <span className="text-ink-100">
                  {titleOf(l.game)} · {l.hostName}
                  <span className="ml-2 text-sm text-ink-muted">
                    {l.players}/{l.maxSeats} ({l.humans} играчи)
                  </span>
                </span>
                <Button variant="felt" onClick={() => lobbyActions.join(l.id)} disabled={l.players >= l.maxSeats}>
                  Влез
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
