import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Panel, cn } from "../../ui";
import { api, type AdminFlag, type AdminStats } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { GAME_CATALOG } from "../lobby/games";
import { AdminUsers } from "./AdminUsers";

type Tab = "dashboard" | "users" | "flags" | "discord";

export function AdminPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("dashboard");

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: t("admin.dashboard") },
    { key: "users", label: t("admin.users") },
    { key: "flags", label: t("admin.flags") },
    { key: "discord", label: "Discord" },
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
      {tab === "users" ? <AdminUsers /> : null}
      {tab === "flags" ? <Flags /> : null}
      {tab === "discord" ? <Discord /> : null}
    </div>
  );
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api.adminStats().then(setStats).catch(() => undefined);
  }, []);

  if (!stats) return <p className="text-ink-muted">{t("common.loading")}</p>;

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
                <span className="text-ink-muted">{new Date(a.createdAt).toLocaleString("bg-BG")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Flags() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<AdminFlag[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.adminFlags("OPEN").then((r) => setFlags(r.flags)).catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  async function review(id: string, status: string) {
    setBusy(id);
    try {
      await api.adminReviewFlag(id, status);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (flags.length === 0)
    return (
      <Panel className="py-10 text-center text-ink-muted">{t("admin.noFlags")}</Panel>
    );

  return (
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
              {f.userAId.slice(0, 8)}… ↔ {f.userBId.slice(0, 8)}…
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" loading={busy === f.id} onClick={() => review(f.id, "DISMISSED")}>
              {t("admin.dismiss")}
            </Button>
            <Button loading={busy === f.id} onClick={() => review(f.id, "CONFIRMED")} className="!bg-loss">
              {t("admin.confirm")}
            </Button>
          </div>
        </Panel>
      ))}
    </ul>
  );
}

function Discord() {
  const { t } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canWrite = isAdmin(meRole);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.adminDiscord().then((r) => setEnabled(r.enabled)).catch(() => undefined);
  }, []);

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

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex items-center justify-between">
        <div>
          <h3 className="text-lg text-ink-100">Discord webhook</h3>
          <p className="text-sm text-ink-muted">{t("admin.discordHint")}</p>
        </div>
        <Badge tone={enabled ? "brass" : "felt"}>
          {enabled === null ? "…" : enabled ? t("admin.connected") : t("admin.notConfigured")}
        </Badge>
      </Panel>

      {canWrite ? (
        <>
          <Panel className="flex flex-col gap-3">
            <h3 className="text-lg text-ink-100">{t("admin.broadcastTitle")}</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1800}
              rows={3}
              placeholder={t("admin.broadcastPlaceholder")}
              className="rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300"
            />
            <div className="flex gap-2">
              <Button loading={busy} disabled={!message.trim()} onClick={broadcast}>
                {t("admin.send")}
              </Button>
              <Button variant="ghost" loading={busy} onClick={test}>
                {t("admin.sendTest")}
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
