import { useTranslation } from "react-i18next";
import { Badge, Button, Panel } from "../../ui";
import { GAME_CATALOG } from "../lobby/games";
import { adminApi } from "./adminApi";
import { ErrorPanel, useLoad } from "./load";

/** Compact "3m 12s" age from a millisecond duration. */
function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

const gameTitle = (key: string): string => GAME_CATALOG.find((g) => g.key === key)?.title ?? key;

/**
 * Live tables view (§14): the in-progress matches the realtime node holds in
 * memory. Read-only. Single-node scope — see the API's GET /admin/rooms note.
 */
export function AdminRooms() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useLoad(() => adminApi.rooms(), []);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-ink-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {t("admin.roomsCount", "{{n}} живи маси", { n: data.rooms.length })}
        </p>
        <Button variant="felt" onClick={reload}>
          {t("admin.refresh", "Опресни")}
        </Button>
      </div>

      {!data.reachable ? (
        <Panel className="py-6 text-center text-sm text-loss">
          {t("admin.roomsUnreachable", "Realtime сървърът е недостъпен.")}
        </Panel>
      ) : data.rooms.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.roomsEmpty", "Няма живи маси в момента.")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.rooms.map((r) => (
            <Panel key={r.matchId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brass">{gameTitle(r.game)}</Badge>
                <span className="font-mono text-xs text-ink-muted">{r.matchId.slice(0, 10)}…</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
                  <span>{t("admin.roomAge", "Възраст")}: {fmtAge(r.ageMs)}</span>
                  <span>{t("admin.roomPly", "Ходове")}: {r.ply}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.seats.map((s) => (
                  <span
                    key={s.seat}
                    className="flex items-center gap-1.5 rounded-card border border-brass-400/15 bg-felt-900/40 px-2 py-1 text-xs"
                  >
                    <span
                      className={
                        s.isBot
                          ? "text-ink-muted"
                          : s.connected && !s.substituted
                            ? "text-win"
                            : "text-loss"
                      }
                      aria-hidden
                    >
                      ●
                    </span>
                    <span className="text-ink-100">{s.displayName}</span>
                    {s.isBot ? <Badge tone="felt">{t("admin.roomBot", "Бот")}</Badge> : null}
                    {!s.isBot && s.substituted ? (
                      <Badge tone="felt">{t("admin.roomSubstituted", "Бот замества")}</Badge>
                    ) : null}
                    {r.turn === s.seat ? <span className="text-brass-300">{t("admin.roomTurn", "на ход")}</span> : null}
                  </span>
                ))}
              </div>
            </Panel>
          ))}
        </ul>
      )}
    </div>
  );
}
