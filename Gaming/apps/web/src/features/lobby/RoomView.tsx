import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_MAGNAT_CONFIG,
  resolveMagnatConfig,
  type LobbySnapshot,
  type MagnatConfig,
} from "@aso/shared";
import { Badge, Button, Panel } from "../../ui";
import { api, type FriendEntry } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { gameTitle } from "./games";
import { lobbyActions } from "./lobbyActions";

export function RoomView({ lobby }: { lobby: LobbySnapshot }) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isHost = !!me && me.id === lobby.hostUserId;
  const title = gameTitle(t, lobby.game);
  const hasTeams = lobby.teams > 1;
  const teamName = (team: number) => t("room.teamName", { num: team + 1 });
  const filled = lobby.seats.filter((s) => s.userId || s.isBot).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl text-brass-300">
          {t("room.title", { title })}
          <span className="ml-3 align-middle text-sm text-ink-muted">
            {lobby.visibility === "public" ? t("room.public") : t("room.private")}
          </span>
        </h1>
        <Button variant="ghost" onClick={() => lobbyActions.leave()}>
          {t("room.leave")}
        </Button>
      </div>

      <Panel className="mb-4">
        <h2 className="mb-3 text-lg text-ink-300">
          {t("room.seats", { filled, max: lobby.maxSeats })}
          {lobby.minSeats < lobby.maxSeats ? (
            <span className="ml-2 text-sm text-ink-muted">{t("room.minHint", { min: lobby.minSeats })}</span>
          ) : null}
        </h2>
        <div className="flex flex-col gap-4">
          {Array.from({ length: hasTeams ? lobby.teams : 1 }).map((_, team) => (
            <div key={team}>
              {hasTeams ? <p className="mb-1 text-sm font-semibold text-brass-300">{teamName(team)}</p> : null}
              <div className="flex flex-col gap-2">
                {lobby.seats
                  .filter((s) => (hasTeams ? s.team === team : true))
                  .map((s) => {
                    const empty = !s.userId && !s.isBot;
                    const meSeat = !!me && s.userId === me.id;
                    return (
                      <div
                        key={s.seat}
                        className="flex items-center justify-between gap-2 rounded-card border border-brass-400/15 bg-felt-900/50 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-ink-100">
                          <span className="w-6 text-center text-ink-muted">{s.seat + 1}</span>
                          {empty ? (
                            <span className="text-ink-muted">{t("room.empty")}</span>
                          ) : (
                            <>
                              {s.isBot ? "🤖 " : ""}
                              {s.displayName || t("room.player")}
                              {meSeat ? ` ${t("room.you")}` : ""}
                            </>
                          )}
                          {s.isHost ? <Badge tone="vip">{t("room.host")}</Badge> : null}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* team switch (host, team games, occupied) */}
                          {isHost && hasTeams && !empty
                            ? Array.from({ length: lobby.teams }).map((__, tm) =>
                                tm === s.team ? null : (
                                  <button
                                    key={tm}
                                    type="button"
                                    onClick={() => lobbyActions.setTeam(lobby.id, s.seat, tm)}
                                    className="rounded bg-felt-700 px-2 py-1 text-xs text-ink-200 hover:text-ink-100"
                                  >
                                    {t("room.moveToTeam", { team: teamName(tm) })}
                                  </button>
                                ),
                              )
                            : null}
                          {isHost && empty ? (
                            <button
                              type="button"
                              onClick={() => lobbyActions.addBot(lobby.id)}
                              className="rounded bg-felt-700 px-2 py-1 text-xs text-ink-200 hover:text-ink-100"
                            >
                              {t("room.addBotShort")}
                            </button>
                          ) : null}
                          {isHost && s.isBot ? (
                            <button
                              type="button"
                              onClick={() => lobbyActions.removeBot(lobby.id, s.seat)}
                              className="rounded bg-felt-700 px-2 py-1 text-xs text-ink-200 hover:text-loss"
                            >
                              {t("room.removeBot")}
                            </button>
                          ) : null}
                          {isHost && s.userId && !s.isHost ? (
                            <button
                              type="button"
                              onClick={() => lobbyActions.kick(lobby.id, s.seat)}
                              aria-label={t("room.kick")}
                              className="text-ink-muted hover:text-loss"
                            >
                              ✕
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => lobbyActions.start(lobby.id)} disabled={!lobby.canStart}>
              {t("room.start")}
            </Button>
            <Button
              variant="felt"
              onClick={() => lobbyActions.addBot(lobby.id)}
              disabled={lobby.seats.every((s) => s.userId || s.isBot)}
            >
              {t("room.addBot")}
            </Button>
            {!lobby.canStart ? (
              <span className="self-center text-sm text-ink-muted">
                {t("room.needPlayers", { min: lobby.minSeats })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">{t("room.waitHost")}</p>
        )}
      </Panel>

      {lobby.game === "MAGNAT" && isHost ? <MagnatConfigPanel lobby={lobby} /> : null}

      <InviteFriends lobbyId={lobby.id} seated={lobby.seats.map((s) => s.userId).filter(Boolean) as string[]} />
    </div>
  );
}

/** Host-only МАГНАТ house-rules editor; pushes config to the lobby on change. */
function MagnatConfigPanel({ lobby }: { lobby: LobbySnapshot }) {
  const { t } = useTranslation();
  const cfg = resolveMagnatConfig(lobby.config as Partial<MagnatConfig> | null);
  const set = (patch: Partial<MagnatConfig>) => lobbyActions.setConfig(lobby.id, { ...cfg, ...patch });

  return (
    <Panel className="mb-4">
      <h2 className="mb-3 text-lg text-ink-300">{t("magnat.rulesTitle")}</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">{t("magnat.startingCash")}</span>
          <input
            type="number" min={500} max={50000} step={100} value={cfg.startingCash}
            onChange={(e) => set({ startingCash: Number(e.target.value) })}
            className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-ink-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">{t("magnat.goBonus")}</span>
          <input
            type="number" min={0} max={1000} step={50} value={cfg.goBonus}
            onChange={(e) => set({ goBonus: Number(e.target.value) })}
            className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-ink-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">{t("magnat.turnTime")}</span>
          <input
            type="number" min={10} max={120} step={5} value={cfg.turnSeconds}
            onChange={(e) => set({ turnSeconds: Number(e.target.value) })}
            className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-ink-100"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.auctions} onChange={(e) => set({ auctions: e.target.checked })} />
          <span className="text-ink-100">{t("magnat.auctions")}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.freeParkingPot} onChange={(e) => set({ freeParkingPot: e.target.checked })} />
          <span className="text-ink-100">{t("magnat.pot")}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.trading} onChange={(e) => set({ trading: e.target.checked })} />
          <span className="text-ink-100">{t("magnat.trading")}</span>
        </label>
      </div>
      <button
        type="button"
        onClick={() => lobbyActions.setConfig(lobby.id, DEFAULT_MAGNAT_CONFIG)}
        className="mt-3 text-xs text-ink-muted hover:text-ink-100"
      >
        {t("magnat.resetRules")}
      </button>
    </Panel>
  );
}

function InviteFriends({ lobbyId, seated }: { lobbyId: string; seated: string[] }) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  useEffect(() => {
    void api.friends().then((d) => setFriends(d.friends)).catch(() => undefined);
  }, []);
  const invitable = friends.filter((f) => !seated.includes(f.id));
  if (invitable.length === 0) return null;
  return (
    <Panel>
      <h2 className="mb-3 text-lg text-ink-300">{t("room.inviteFriends")}</h2>
      <ul className="flex flex-col gap-2">
        {invitable.map((f) => (
          <li key={f.id} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-ink-100">
              <span className={`size-2.5 rounded-full ${f.online ? "bg-win" : "bg-ink-muted"}`} />
              {f.displayName}
            </span>
            <Button variant="felt" disabled={!f.online} onClick={() => lobbyActions.invite(lobbyId, f.id)}>
              {t("room.invite")}
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
