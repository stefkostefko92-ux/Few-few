import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { SOCKET_EVENTS, type GameKey } from "@aso/shared";
import { Badge, Button, Field, Panel } from "../../ui";
import { api, type FriendEntry, type FriendLite, type FriendsResponse } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { GAME_CATALOG } from "../lobby/games";

const READY_GAMES = GAME_CATALOG.filter((g) => g.ready);

export function FriendsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FriendLite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.friends().then(setData).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    const r = await api.friendSearch(q.trim());
    setResults(r.users);
  }

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-4xl text-brass-300">{t("friends.title")}</h1>

      {/* Search / add */}
      <Panel className="mb-6">
        <form onSubmit={search} className="flex gap-2">
          <Field
            label=""
            aria-label={t("friends.search")}
            placeholder={t("friends.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1"
          />
          <Button type="submit">{t("friends.searchBtn")}</Button>
        </form>
        {results.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {results.map((u) => (
              <li key={u.id} className="flex items-center justify-between">
                <span className="text-ink-100">{u.displayName}</span>
                <Button
                  variant="felt"
                  loading={busy === u.id}
                  onClick={() =>
                    act(u.id, async () => {
                      await api.friendRequest(u.id);
                      setResults((p) => p.filter((x) => x.id !== u.id));
                    })
                  }
                >
                  {t("friends.add")}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {/* Incoming requests */}
      {data?.incoming.length ? (
        <Section title={t("friends.incoming")}>
          {data.incoming.map((p) => (
            <Row key={p.friendshipId} name={p.displayName}>
              <Button loading={busy === p.friendshipId} onClick={() => act(p.friendshipId, () => api.friendAccept(p.friendshipId))}>
                {t("friends.accept")}
              </Button>
              <Button variant="ghost" loading={busy === p.friendshipId} onClick={() => act(p.friendshipId, () => api.friendDecline(p.friendshipId))}>
                {t("friends.decline")}
              </Button>
            </Row>
          ))}
        </Section>
      ) : null}

      {/* Friends */}
      <Section title={t("friends.yourFriends")}>
        {data && data.friends.length === 0 ? (
          <p className="text-ink-muted">{t("friends.empty")}</p>
        ) : (
          data?.friends.map((f) => <FriendRow key={f.friendshipId} f={f} act={act} t={t} />)
        )}
      </Section>

      {/* Outgoing */}
      {data?.outgoing.length ? (
        <Section title={t("friends.outgoing")}>
          {data.outgoing.map((p) => (
            <Row key={p.friendshipId} name={p.displayName}>
              <span className="text-sm text-ink-muted">{t("friends.pending")}</span>
            </Row>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg text-ink-300">{title}</h2>
      <Panel className="flex flex-col gap-3">{children}</Panel>
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-100">{name}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function FriendRow({
  f,
  act,
  t,
}: {
  f: FriendEntry;
  act: (key: string, fn: () => Promise<unknown>) => void;
  t: (k: string) => string;
}) {
  const [game, setGame] = useState<GameKey>((READY_GAMES[0]?.key ?? "CHESS") as GameKey);

  function invite() {
    getSocket().emit(SOCKET_EVENTS.INVITE_SEND, { toUserId: f.id, game });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-ink-100">
        <span
          className={`size-2.5 rounded-full ${f.online ? "bg-win" : "bg-ink-muted"}`}
          title={f.online ? t("friends.online") : t("friends.offline")}
        />
        {f.displayName}
        {f.vipTier !== "NONE" ? <Badge tone="vip">VIP</Badge> : null}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={game}
          onChange={(e) => setGame(e.target.value as GameKey)}
          className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-1.5 text-sm text-ink-100"
        >
          {READY_GAMES.map((g) => (
            <option key={g.key} value={g.key}>
              {g.title}
            </option>
          ))}
        </select>
        <Button variant="felt" disabled={!f.online} onClick={invite}>
          {t("friends.invite")}
        </Button>
        <button
          type="button"
          onClick={() => act(f.id, () => api.friendRemove(f.id))}
          aria-label={t("friends.remove")}
          className="text-ink-muted hover:text-loss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
