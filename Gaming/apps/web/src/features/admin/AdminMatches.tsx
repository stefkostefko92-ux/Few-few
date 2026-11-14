import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { GAME_KEYS } from "@aso/shared";
import { Badge, Button, Field, Modal, Panel } from "../../ui";
import { adminApi, type AdminMatchRow } from "./adminApi";
import { UserDetailModal } from "./AdminUsers";
import { ErrorPanel, errorMessage, useLoad } from "./load";
import i18next from "i18next";
import type { GameKey } from "@aso/shared";
import { gameTitle as sharedGameTitle } from "../lobby/games";

const selectCls = "rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-sm text-ink-100";

// Преводимото име на играта (EN/IT интерфейсът не показва българските заглавия).
const gameTitle = (key: string): string => sharedGameTitle(i18next.t, key as GameKey);

/** Всички мачове (четене за персонала): филтри по игра/играч/дати, курсор, детайл. */
export function AdminMatches() {
  const { t, i18n } = useTranslation();
  const [game, setGame] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<AdminMatchRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await adminApi.matches({
        game: game || undefined,
        userId: userId.trim() || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
        cursor: c,
      });
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [game]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onFilter} className="flex flex-wrap items-end gap-2">
        <select
          aria-label={t("admin.matchGame", "Игра")}
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("admin.allGames", "Всички игри")}</option>
          {GAME_KEYS.map((g) => (
            <option key={g} value={g}>
              {gameTitle(g)}
            </option>
          ))}
        </select>
        <Field
          label=""
          aria-label={t("admin.matchUserId", "ID на играч")}
          placeholder={t("admin.matchUserId", "ID на играч")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-44 !py-2 text-sm"
        />
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          {t("admin.fromDate", "От")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          {t("admin.toDate", "До")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
        </label>
        <Button type="submit" variant="felt">
          {t("admin.applyFilters", "Филтрирай")}
        </Button>
      </form>

      {error && items.length === 0 ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : loading && items.length === 0 ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.noMatches", "Няма изиграни мачове.")}</Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted">
              <tr className="border-b border-brass-400/15">
                <th className="px-3 py-2">{t("admin.matchGame", "Игра")}</th>
                <th className="px-3 py-2">{t("admin.matchMode", "Режим")}</th>
                <th className="px-3 py-2 text-right">{t("admin.matchPlayers", "Играчи")}</th>
                <th className="px-3 py-2">{t("admin.matchStarted", "Начало")}</th>
                <th className="px-3 py-2">{t("admin.matchStatus", "Статус")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-brass-400/5 hover:bg-felt-700/30">
                  <td className="px-3 py-2 text-ink-100">{gameTitle(m.game)}</td>
                  <td className="px-3 py-2 text-ink-300">{m.mode}</td>
                  <td className="px-3 py-2 text-right tnum text-ink-300">{m.players}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">{new Date(m.startedAt).toLocaleString(i18n.language)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={m.endedAt ? "felt" : "brass"}>
                      {m.endedAt ? t("admin.matchEnded", "Приключил") : t("admin.matchLive", "Тече")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" onClick={() => setOpenId(m.id)}>
                      {t("admin.details", "Детайли")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {error && items.length > 0 ? <p className="text-center text-sm text-loss">{errorMessage(error)}</p> : null}
      {cursor && !loading ? (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t("admin.loadMore")}
        </Button>
      ) : null}

      {openId ? (
        <MatchDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onOpenUser={(uid) => {
            // Без вложени модали (двата биха хванали Escape) — сменяме единия с другия.
            setOpenId(null);
            setOpenUser(uid);
          }}
        />
      ) : null}
      {openUser ? (
        <UserDetailModal id={openUser} onClose={() => setOpenUser(null)} onChanged={() => undefined} />
      ) : null}
    </div>
  );
}

function MatchDetailModal({
  id,
  onClose,
  onOpenUser,
}: {
  id: string;
  onClose: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data, error, loading, reload } = useLoad(() => adminApi.match(id), [id]);
  const m = data?.match;

  return (
    <Modal open onClose={onClose} title={m ? `${gameTitle(m.game)} · ${m.mode}` : "…"}>
      {error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : loading || !m ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : (
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1 text-sm">
          <div className="text-xs text-ink-muted">
            <div>ID: {m.id}</div>
            <div>
              {t("admin.matchStarted", "Начало")}: {new Date(m.startedAt).toLocaleString(i18n.language)}
            </div>
            <div>
              {t("admin.matchEndedAt", "Край")}:{" "}
              {m.endedAt ? new Date(m.endedAt).toLocaleString(i18n.language) : t("admin.matchLive", "Тече")}
            </div>
            <div className="break-all">
              Seed:{" "}
              {m.seedHidden ? (
                <span className="italic">{t("admin.matchSeedHidden", "скрит, докато мачът тече")}</span>
              ) : (
                <span className="font-mono">{m.seed}</span>
              )}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-ink-muted">
              <tr className="border-b border-brass-400/15">
                <th className="py-1">{t("admin.seat", "Място")}</th>
                <th className="py-1">{t("admin.player")}</th>
                <th className="py-1">{t("admin.matchResult", "Резултат")}</th>
                <th className="py-1 text-right">MMR</th>
                <th className="py-1 text-right">🪙</th>
              </tr>
            </thead>
            <tbody>
              {m.players.map((p) => (
                <tr key={p.id} className="border-b border-brass-400/5 text-ink-300">
                  <td className="py-1 tnum">{p.seat}</td>
                  <td className="py-1">
                    <button type="button" className="text-brass-300 underline" onClick={() => onOpenUser(p.userId)}>
                      {p.displayName ?? p.userId.slice(0, 8)}
                    </button>
                  </td>
                  <td className={p.result === "win" ? "py-1 text-win" : p.result === "loss" ? "py-1 text-loss" : "py-1"}>
                    {p.result ?? "—"}
                  </td>
                  <td className="py-1 text-right tnum">{p.mmrDelta > 0 ? `+${p.mmrDelta}` : p.mmrDelta}</td>
                  <td className="py-1 text-right tnum">
                    {Number(p.chipsDelta) > 0 ? `+${p.chipsDelta}` : p.chipsDelta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
