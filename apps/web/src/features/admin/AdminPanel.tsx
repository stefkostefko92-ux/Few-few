import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Panel, cn } from "../../ui";
import { api, type AdminAuditEntry, type AdminFlag, type DiscordConfig, type DiscordEventKey } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { GAME_CATALOG } from "../lobby/games";
import { adminApi } from "./adminApi";
import { AdminEconomy } from "./AdminEconomy";
import { AdminReports } from "./AdminReports";
import { AdminUsers, UserDetailModal } from "./AdminUsers";
import { ErrorPanel, errorMessage, useLoad } from "./load";

type Tab = "dashboard" | "economy" | "users" | "flags" | "reports" | "discord" | "audit";

export function AdminPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: t("admin.dashboard") },
    { key: "economy", label: t("admin.economy", "Икономика") },
    { key: "users", label: t("admin.users") },
    { key: "flags", label: t("admin.flags") },
    { key: "reports", label: t("admin.reports", "Доклади") },
    { key: "discord", label: "Discord" },
    { key: "audit", label: t("admin.audit") },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-4xl text-brass-300">{t("admin.title")}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t("admin.subtitle")}</p>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-brass-400/15">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === tb.key
                ? "border-brass-300 text-brass-300"
                : "border-transparent text-ink-300 hover:text-ink-100",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? <Dashboard /> : null}
      {tab === "economy" ? <AdminEconomy /> : null}
      {tab === "users" ? <AdminUsers /> : null}
      {tab === "flags" ? <Flags /> : null}
      {tab === "reports" ? <AdminReports /> : null}
      {tab === "discord" ? <Discord /> : null}
      {tab === "audit" ? <Audit /> : null}
    </div>
  );
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

function Dashboard() {
  const { t, i18n } = useTranslation();
  const { data: stats, error, loading, reload } = useLoad(() => api.adminStats(), []);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading || !stats) return <p className="text-ink-muted">{t("common.loading")}</p>;

  const cards: { label: string; value: string; accent?: boolean }[] = [
    { label: t("admin.totalUsers"), value: String(stats.users) },
    { label: t("admin.newToday"), value: `+${stats.newToday}` },
    { label: t("admin.matchesToday"), value: String(stats.matchesToday) },
    { label: t("admin.revenue"), value: eur(stats.revenueCents), accent: true },
    { label: t("admin.purchases"), value: String(stats.purchases) },
    { label: t("admin.openFlags"), value: String(stats.openFlags), accent: stats.openFlags > 0 },
    { label: t("admin.banned"), value: String(stats.banned) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Panel key={c.label} className="p-4">
            <div className={cn("font-display text-2xl", c.accent ? "text-brass-300" : "text-ink-100")}>
              {c.value}
            </div>
            <div className="text-xs text-ink-muted">{c.label}</div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel>
          <h3 className="mb-3 text-lg text-ink-100">{t("admin.vipBreakdown")}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.vip).map(([tier, n]) => (
              <Badge key={tier} tone={tier === "NONE" ? "felt" : "vip"}>
                {tier}: {n}
              </Badge>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 text-lg text-ink-100">{t("admin.gamesToday")}</h3>
          {Object.keys(stats.gamesToday).length === 0 ? (
            <p className="text-sm text-ink-muted">{t("admin.noGames")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {Object.entries(stats.gamesToday)
                .sort((a, b) => b[1] - a[1])
                .map(([key, n]) => (
                  <li key={key} className="flex items-center justify-between">
                    <span className="text-ink-200">
                      {GAME_CATALOG.find((g) => g.key === key)?.title ?? key}
                    </span>
                    <span className="tnum text-brass-300">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-3 text-lg text-ink-100">{t("admin.recentActions")}</h3>
        {stats.audits.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("admin.noActions")}</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-ink-300">
            {stats.audits.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                <span className="text-brass-300">{a.action}</span>
                <span className="text-ink-muted">· {a.actorName} ·</span>
                <span className="text-ink-muted">{new Date(a.createdAt).toLocaleString(i18n.language)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

const FLAG_STATUSES = ["OPEN", "REVIEWING", "DISMISSED", "CONFIRMED"] as const;

function Flags() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<(typeof FLAG_STATUSES)[number]>("OPEN");
  const [busy, setBusy] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [flags, setFlags] = useState<AdminFlag[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await api.adminFlags(status, c);
      setFlags((prev) => (c ? [...prev, ...r.flags] : r.flags));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setFlags([]);
    void load();
  }, [status]);

  const reload = () => void load();

  async function review(id: string, next: string) {
    setBusy(id);
    try {
      await api.adminReviewFlag(id, next);
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FLAG_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              status === s
                ? "border-brass-400/40 bg-brass-400/15 text-brass-300"
                : "border-brass-400/10 text-ink-300 hover:text-ink-100",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {error && flags.length === 0 ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : loading && flags.length === 0 ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : flags.length === 0 ? (
        <Panel className="py-10 text-center text-ink-muted">{t("admin.noFlags")}</Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {flags.map((f) => (
            <Panel key={f.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-ink-100">
                  <Badge tone="felt">{f.game}</Badge>
                  {f.reason}
                  <span className="tnum text-loss">({f.score.toFixed(2)})</span>
                </div>
                <div className="text-xs text-ink-muted">
                  <button type="button" className="text-brass-300 underline" onClick={() => setOpenUser(f.userAId)}>
                    {f.userAId.slice(0, 8)}…
                  </button>{" "}
                  ↔{" "}
                  <button type="button" className="text-brass-300 underline" onClick={() => setOpenUser(f.userBId)}>
                    {f.userBId.slice(0, 8)}…
                  </button>
                </div>
              </div>
              {f.status === "OPEN" || f.status === "REVIEWING" ? (
                <div className="flex gap-2">
                  <Button variant="ghost" loading={busy === f.id} onClick={() => review(f.id, "DISMISSED")}>
                    {t("admin.dismiss")}
                  </Button>
                  <Button loading={busy === f.id} onClick={() => review(f.id, "CONFIRMED")} className="!bg-loss">
                    {t("admin.confirm")}
                  </Button>
                </div>
              ) : (
                <Badge tone="felt">{f.status}</Badge>
              )}
            </Panel>
          ))}
        </ul>
      )}

      {error && flags.length > 0 ? <p className="text-center text-sm text-loss">{errorMessage(error)}</p> : null}
      {cursor && !loading ? (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t("admin.loadMore")}
        </Button>
      ) : null}

      {openUser ? (
        <UserDetailModal id={openUser} onClose={() => setOpenUser(null)} onChanged={reload} />
      ) : null}
    </div>
  );
}

function Discord() {
  const { t } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canWrite = isAdmin(meRole);
  const { data, error, loading, reload } = useLoad(() => api.adminDiscord(), []);
  const [cfg, setCfg] = useState<DiscordConfig | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  const DISCORD_EVENTS: { key: DiscordEventKey; label: string }[] = [
    { key: "registration", label: t("admin.evRegistration", "Регистрации") },
    { key: "purchase", label: t("admin.evPurchase", "Покупки") },
    { key: "vip", label: t("admin.evVip", "VIP") },
    { key: "flag", label: t("admin.evFlag", "Сигнали (колюзия)") },
    { key: "adminAction", label: t("admin.evAdminAction", "Админ действия") },
    { key: "broadcast", label: t("admin.evBroadcast", "Съобщения") },
  ];

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api.adminDiscordSave(cfg);
      setCfg(saved);
      setNotice(t("admin.saved"));
    } catch {
      setNotice(t("admin.discordBadUrl"));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.adminDiscordTest();
      setNotice(r.sent ? t("admin.discordSent") : t("admin.discordDisabled"));
    } finally {
      setBusy(false);
    }
  }

  async function broadcast() {
    if (!message.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.adminBroadcast(message);
      setNotice(r.sent ? t("admin.discordSent") : t("admin.discordDisabled"));
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading || !cfg) return <p className="text-ink-muted">{t("common.loading")}</p>;
  const field =
    "rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300";

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex items-center justify-between">
        <div>
          <h3 className="text-lg text-ink-100">Discord webhook</h3>
          <p className="text-sm text-ink-muted">{t("admin.discordHint")}</p>
        </div>
        <Badge tone={cfg.enabled && cfg.webhookUrl ? "brass" : "felt"}>
          {cfg.enabled && cfg.webhookUrl ? t("admin.connected") : t("admin.notConfigured")}
        </Badge>
      </Panel>

      {canWrite ? (
        <>
          <Panel className="flex flex-col gap-3">
            <h3 className="text-lg text-ink-100">{t("admin.discordConfig")}</h3>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Webhook URL</span>
              <input
                type="url"
                value={cfg.webhookUrl}
                onChange={(e) => setCfg({ ...cfg, webhookUrl: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
                className={field}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-muted">{t("admin.discordBotName")}</span>
                <input
                  type="text"
                  value={cfg.webhookName}
                  onChange={(e) => setCfg({ ...cfg, webhookName: e.target.value })}
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2 sm:mt-6">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
                />
                <span className="text-ink-100">{t("admin.discordEnabled")}</span>
              </label>
            </div>
            <div>
              <p className="mb-1 text-sm text-ink-muted">{t("admin.discordEvents")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DISCORD_EVENTS.map((ev) => (
                  <label key={ev.key} className="flex items-center gap-2 text-sm text-ink-100">
                    <input
                      type="checkbox"
                      checked={cfg.events[ev.key]}
                      onChange={(e) => setCfg({ ...cfg, events: { ...cfg.events, [ev.key]: e.target.checked } })}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button loading={busy} onClick={save}>
                {t("admin.save")}
              </Button>
              <Button variant="ghost" loading={busy} onClick={test}>
                {t("admin.sendTest")}
              </Button>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-3">
            <h3 className="text-lg text-ink-100">{t("admin.broadcastTitle")}</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1800}
              rows={3}
              placeholder={t("admin.broadcastPlaceholder")}
              className={field}
            />
            <div className="flex gap-2">
              <Button loading={busy} disabled={!message.trim()} onClick={broadcast}>
                {t("admin.send")}
              </Button>
            </div>
          </Panel>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t("admin.readOnly")}</p>
      )}

      {notice ? <p className="text-center text-sm text-win">{notice}</p> : null}
    </div>
  );
}

// Action keys the API writes today (free strings; the select is a convenience).
const AUDIT_ACTIONS = [
  "update_user",
  "review_flag",
  "resolve_report",
  "discord_config",
  "broadcast",
  "bootstrap_owner",
];

function prettyDetail(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

function Audit() {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<AdminAuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);

  const selectCls =
    "rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-sm text-ink-100";

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await adminApi.audit({
        action: action || undefined,
        actor: actor.trim() || undefined,
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
  }, [action]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onFilter} className="flex flex-wrap items-end gap-2">
        <select
          aria-label={t("admin.action", "Действие")}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("admin.allActions", "Всички действия")}</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <Field
          label=""
          aria-label={t("admin.actor", "Админ")}
          placeholder={t("admin.actor", "Админ")}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="w-36 !py-2 text-sm"
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
        <Panel className="py-10 text-center text-ink-muted">{t("admin.noActions")}</Panel>
      ) : (
        <Panel className="flex flex-col gap-2">
          {items.map((a) => (
            <div key={a.id} className="border-b border-brass-400/10 pb-2 text-sm last:border-0">
              <button
                type="button"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="flex w-full flex-wrap items-center gap-x-2 text-left"
                aria-expanded={expanded === a.id}
              >
                <span className="text-brass-300">{a.action}</span>
                <span className="text-ink-300">· {a.actorName}</span>
                {a.targetId ? <span className="text-ink-muted">→ {a.targetId.slice(0, 8)}…</span> : null}
                <span className="ml-auto text-xs text-ink-muted">
                  {new Date(a.createdAt).toLocaleString(i18n.language)}
                </span>
              </button>
              {expanded === a.id ? (
                <div className="mt-2 flex flex-col gap-1">
                  <pre className="max-h-48 overflow-auto rounded-card border border-brass-400/10 bg-felt-900/60 p-2 text-xs text-ink-300">
                    {prettyDetail(a.detail)}
                  </pre>
                  {a.targetId ? (
                    <button
                      type="button"
                      className="self-start text-xs text-brass-300 underline"
                      onClick={() => setOpenUser(a.targetId)}
                    >
                      {t("admin.openTarget", "Отвори играча")} →
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </Panel>
      )}

      {error && items.length > 0 ? <p className="text-center text-sm text-loss">{errorMessage(error)}</p> : null}
      {cursor && !loading ? (
        <Button variant="ghost" onClick={() => void load(cursor)}>
          {t("admin.loadMore")}
        </Button>
      ) : null}

      {openUser ? (
        <UserDetailModal id={openUser} onClose={() => setOpenUser(null)} onChanged={() => undefined} />
      ) : null}
    </div>
  );
}
