// frontend/src/pages/ServerHome.jsx
// Overview — командният екран на сървъра.
//
// Дисциплина (dataviz): филтърът за период е ЕДИН ред НАД всичко, което
// скоупва (не по един на карта); при презареждане държим предишния рендер на
// намалена плътност вместо скелет (без скок на оформлението); всяка графика
// има четим близнак (table view / директни етикети); статусните цветове идват
// с иконка и текст, никога само цвят.
import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../contexts/ToastContext";
import {
  Ticket, FileText, Layout, Star, Users, ShieldCheck, Zap, LineChart, Key,
  BookOpen, Webhook, Settings, Bot, CheckCircle2, Circle, ArrowRight,
  Inbox, Timer, ClipboardList, Activity, Plus, Send, ChevronRight, AlertCircle,
} from "lucide-react";
import { getServer, getPanels, getForms, getDashboard, getStatus } from "../api";
import StatTile from "../components/StatTile";
import ServerCrest from "../components/ServerCrest";
import AreaChart from "../components/charts/AreaChart";
import BarList from "../components/charts/BarList";
import { useT } from "../contexts/I18nContext";

const PERIODS = [7, 14, 30];

export default function ServerHome() {
  const { serverId } = useParams();
  const { t } = useT();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [days, setDays] = useState(14);

  // Stripe checkout връщане (per-server): ?upgraded=true / ?canceled=true.
  // Дотук редиректът беше НЯМ — потребителят плащаше и кацаше без никаква
  // обратна връзка. Тостваме веднъж и чистим URL-а (bookmark/refresh не
  // повтарят съобщението). Активацията идва от webhook-а — затова „within a
  // few seconds", не „активиран е".
  useEffect(() => {
    if (searchParams.get("upgraded") === "true") toast.success(t("premium.upgraded"));
    else if (searchParams.get("canceled") === "true") toast.error(t("premium.checkoutCanceled"));
    else return;
    const next = new URLSearchParams(searchParams);
    next.delete("upgraded"); next.delete("canceled");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: server, isLoading: serverLoading, isError: serverError } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    retry: 1,
  });
  const { data: dash, isLoading: dashLoading, isFetching: dashFetching } = useQuery({
    queryKey: ["dashboard", serverId, days],
    queryFn: () => getDashboard(serverId, days),
    enabled: !!server,
    // Държи предишните данни при смяна на периода — иначе екранът мига в скелет.
    placeholderData: (prev) => prev,
  });
  const { data: status } = useQuery({
    queryKey: ["public-status"],
    queryFn: getStatus,
    enabled: !!server,
    refetchInterval: 60_000,
  });
  const { data: panels } = useQuery({ queryKey: ["panels", serverId], queryFn: () => getPanels(serverId), enabled: !!server });
  const { data: forms } = useQuery({ queryKey: ["forms", serverId], queryFn: () => getForms(serverId), enabled: !!server });

  if (serverLoading) return <OverviewSkeleton />;

  if (serverError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center min-h-64 text-center" role="alert">
        <Bot className="w-10 h-10 text-cs-cyan mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-cs-text mb-2">{t("overview.notSetup.title")}</h2>
        <p className="text-cs-muted text-sm">{t("overview.notSetup.body")}</p>
        <a
          href={`https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814416&scope=bot+applications.commands&guild_id=${serverId}`}
          target="_blank" rel="noopener noreferrer"
          className="cs-btn-primary mt-4 inline-flex items-center gap-2"
        >
          {t("overview.notSetup.invite")}
        </a>
      </div>
    );
  }

  const k = dash?.kpis;
  const live = dash?.live;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      {/* ── Герб ───────────────────────────────────────────────────────────
          Заменя стария ред „иконка + име + значка Premium“. Показва ТАРИФАТА
          поименно, състоянието на бота и заетите места при agency — всичко от
          реалния отговор, нула догаждане в клиента. */}
      {/* `/api/status` говори на речника operational|degraded|down. Тук се
          сравняваше с "ok" — думата от ВЪТРЕШНИЯ `/health` на бота, която
          backend-ът вече е превел. Значи условието беше винаги невярно и гербът
          пишеше „БОТЪТ Е ОФЛАЙН" на напълно жив бот. (07.08.2026) */}
      <ServerCrest server={server} botOnline={status?.services?.bot?.status === "operational"} />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-cs-dim text-xs font-mono">{t("overview.subtitle")}</p>

        {/* Един филтър-ред над всичко, което скоупва */}
        <div className="flex items-center gap-2" role="group" aria-label="Time range">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              aria-pressed={days === p}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
                days === p
                  ? "border-cs-cyan text-cs-cyan bg-cs-cyanGlow"
                  : "border-cs-border text-cs-muted hover:text-cs-text"
              }`}
            >
              {t(`overview.range.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Задържаме предишния рендер при презареждане — без скелет-мигане */}
      <div className={dashFetching && !dashLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {/* ── KPI ред ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {dashLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="cs-card h-[104px] animate-pulse bg-cs-panel" />)
          ) : (
            <>
              <StatTile icon={Ticket} label={t("overview.kpi.opened")} value={k?.ticketsOpened?.value}
                deltaPct={k?.ticketsOpened?.deltaPct} hint={t("overview.kpi.lastDays", { days })} />
              <StatTile icon={CheckCircle2} label={t("overview.kpi.closed")} value={k?.ticketsClosed?.value}
                deltaPct={k?.ticketsClosed?.deltaPct} hint={t("overview.kpi.lastDays", { days })} />
              <StatTile icon={Timer} label={t("overview.kpi.firstReply")} value={k?.avgFirstResponseMin} unit="min"
                invertDelta hint={k?.avgFirstResponseMin == null ? t("overview.kpi.noReplies") : t("overview.kpi.lowerBetter")} />
              <StatTile icon={ClipboardList} label={t("overview.kpi.applications")} value={k?.applications?.value}
                deltaPct={k?.applications?.deltaPct} hint={t("overview.kpi.pendingReview", { n: live?.pendingApplications ?? 0 })} />
            </>
          )}
        </div>

        {/* ── Активност + странична колона ─────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
          <section className="cs-card xl:col-span-2" aria-labelledby="activity-h">
            <div className="flex items-center justify-between mb-3">
              <h2 id="activity-h" className="font-semibold text-cs-text flex items-center gap-2">
                <Activity className="w-4 h-4 text-cs-cyan" aria-hidden="true" /> {t("overview.activity")}
              </h2>
              <span className="text-xs font-mono text-cs-dim">{t("overview.kpi.lastDays", { days })}</span>
            </div>
            {dashLoading
              ? <div className="h-[300px] animate-pulse bg-cs-panel rounded" />
              : <AreaChart data={dash?.series || []} height={300} />}
          </section>

          <div className="space-y-4">
            <LiveStatePanel live={live} loading={dashLoading} satisfaction={dash?.satisfaction} />
            <SystemStatusPanel status={status} />
          </div>
        </div>

        {/* ── Разпределение + последни тикети + бързи действия ─────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-8">
          <section className="cs-card" aria-labelledby="dist-h">
            <h2 id="dist-h" className="font-semibold text-cs-text mb-3">{t("overview.byPanel")}</h2>
            <BarList items={dash?.distribution || []} emptyLabel={t("overview.byPanel.empty")} />
          </section>

          <section className="cs-card" aria-labelledby="recent-h">
            <div className="flex items-center justify-between mb-3">
              <h2 id="recent-h" className="font-semibold text-cs-text">{t("overview.recentTickets")}</h2>
              <Link to={`/dashboard/${serverId}/tickets`} className="text-xs text-cs-cyan hover:opacity-80 flex items-center gap-1">
                {t("common.viewAll")} <ChevronRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            </div>
            <RecentTickets tickets={dash?.recentTickets} serverId={serverId} />
          </section>

          <section className="cs-card" aria-labelledby="qa-h">
            <h2 id="qa-h" className="font-semibold text-cs-text mb-3">{t("overview.quickActions")}</h2>
            <div className="space-y-2">
              <QuickAction to={`/dashboard/${serverId}/panels`} icon={Plus} label={t("overview.qa.createPanel")} />
              <QuickAction to={`/dashboard/${serverId}/forms`} icon={FileText} label={t("overview.qa.buildForm")} />
              <QuickAction to={`/dashboard/${serverId}/automation`} icon={Send} label={t("overview.qa.startGiveaway")} />
              <QuickAction to={`/dashboard/${serverId}/analytics`} icon={LineChart} label={t("overview.qa.openAnalytics")} />
            </div>
          </section>
        </div>
      </div>

      <GettingStarted serverId={serverId} panels={panels} forms={forms} />

      <h2 className="text-sm font-mono uppercase tracking-wider text-cs-dim mb-3">{t("nav.manageServer")}</h2>
      <NavGrid serverId={serverId} />
    </div>
  );
}

/* ─── Живо състояние ─────────────────────────────────────────────────── */
function LiveStatePanel({ live, loading, satisfaction }) {
  const { t } = useT();
  return (
    <section className="cs-card" aria-labelledby="live-h">
      <h2 id="live-h" className="font-semibold text-cs-text mb-3 flex items-center gap-2">
        <Inbox className="w-4 h-4 text-cs-cyan" aria-hidden="true" /> {t("overview.rightNow")}
      </h2>
      {loading ? (
        <div className="h-20 animate-pulse bg-cs-panel rounded" />
      ) : (
        <dl className="space-y-2.5">
          <Row label={t("overview.openTickets")} value={live?.openTickets ?? 0} />
          <Row label={t("overview.claimedByStaff")} value={live?.claimedTickets ?? 0} />
          <Row label={t("overview.applicationsPending")} value={live?.pendingApplications ?? 0} />
          <Row
            label={t("overview.satisfaction")}
            value={satisfaction?.avg != null ? `${satisfaction.avg} / 5` : "—"}
            hint={satisfaction?.count ? t("overview.ratings", { n: satisfaction.count }) : t("overview.noRatings")}
          />
        </dl>
      )}
    </section>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-cs-muted">{label}</dt>
      <dd className="text-sm font-semibold text-cs-text tabular-nums text-right">
        {value}
        {hint && <span className="block text-[10px] font-normal text-cs-dim">{hint}</span>}
      </dd>
    </div>
  );
}

/* ─── Здраве на платформата ──────────────────────────────────────────── */
function SystemStatusPanel({ status }) {
  const { t } = useT();
  // Имената на услугите остават непреведени (собствени имена: API, Database…).
  const services = [
    ["API", status?.services?.api?.status],
    ["Database", status?.services?.database?.status],
    ["Discord bot", status?.services?.bot?.status],
    ["Cache", status?.services?.cache?.status],
  ];
  return (
    <section className="cs-card" aria-labelledby="sys-h">
      <h2 id="sys-h" className="font-semibold text-cs-text mb-3">{t("overview.systemStatus")}</h2>
      <ul className="space-y-2">
        {services.map(([name, s]) => (
          <li key={name} className="flex items-center justify-between gap-3">
            <span className="text-sm text-cs-muted">{name}</span>
            <StatusPill status={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Статусът НИКОГА не е само цвят — иконка + дума придружават всяка точка.
function StatusPill({ status }) {
  const { t } = useT();
  const map = {
    operational: { cls: "text-success", dot: "bg-success", label: t("overview.status.operational"), Icon: CheckCircle2 },
    ok: { cls: "text-success", dot: "bg-success", label: t("overview.status.operational"), Icon: CheckCircle2 },
    degraded: { cls: "text-warning", dot: "bg-warning", label: t("overview.status.degraded"), Icon: AlertCircle },
    down: { cls: "text-danger", dot: "bg-danger", label: t("overview.status.down"), Icon: AlertCircle },
  };
  const s = map[status] || { cls: "text-cs-dim", dot: "bg-cs-dim", label: t("overview.status.unknown"), Icon: Circle };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      <s.Icon className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/* ─── Последни тикети ────────────────────────────────────────────────── */
const PRIORITY_CLS = {
  URGENT: "text-danger", HIGH: "text-warning", NORMAL: "text-cs-muted", LOW: "text-cs-dim",
};
const STATUS_CLS = {
  OPEN: "cs-badge-success", CLAIMED: "cs-badge-cyan", CLOSED: "cs-badge-muted", ARCHIVED: "cs-badge-muted",
};

function RecentTickets({ tickets, serverId }) {
  if (!tickets?.length) {
    return <p className="text-sm text-cs-muted py-6 text-center">No tickets yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {tickets.slice(0, 5).map((t) => (
        <li key={t.id}>
          {/* no-underline: това е цял ред-връзка с иконки/баджове и hover
              състояние, не цветна дума в проза — WCAG 1.4.1 е спазен без
              подчертаване (глобалното `li a` правило цели прозата). */}
          <Link
            to={`/dashboard/${serverId}/tickets`}
            className="flex items-center gap-2.5 py-1 hover:opacity-80 transition-opacity no-underline"
          >
            <span className="font-mono text-[11px] text-cs-dim tabular-nums flex-shrink-0">
              #{t.number != null ? String(t.number).padStart(4, "0") : t.id.slice(-4)}
            </span>
            <span className="text-sm text-cs-text truncate flex-1">{t.panel?.name || "Direct ticket"}</span>
            <span className={`text-[10px] font-mono uppercase flex-shrink-0 ${PRIORITY_CLS[t.priority] || ""}`}>
              {t.priority !== "NORMAL" ? t.priority : ""}
            </span>
            <span className={`${STATUS_CLS[t.status] || "cs-badge-muted"} flex-shrink-0`}>{t.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function QuickAction({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-3 py-2 border border-cs-border hover:border-cs-cyan/40 hover:bg-cs-panel transition-colors group"
    >
      <Icon className="w-4 h-4 text-cs-cyan flex-shrink-0" aria-hidden="true" />
      <span className="text-sm text-cs-text flex-1">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 text-cs-dim group-hover:text-cs-cyan transition-colors" aria-hidden="true" />
    </Link>
  );
}

/* ─── Навигация ──────────────────────────────────────────────────────── */
function NavGrid({ serverId }) {
  const { t } = useT();
  const ACCENT = "bg-cs-cyanGlow text-cs-cyan";
  // key = nav.<key> за заглавието и navDesc.<key> за описанието.
  const cards = [
    { to: "panels", key: "panels", icon: Layout, color: ACCENT },
    { to: "forms", key: "forms", icon: FileText, color: ACCENT },
    { to: "tickets", key: "tickets", icon: Ticket, color: ACCENT },
    { to: "applications", key: "applications", icon: Users, color: ACCENT },
    { to: "verification", key: "verification", icon: ShieldCheck, color: ACCENT },
    { to: "automation", key: "automation", icon: Zap, color: ACCENT },
    { to: "analytics", key: "analytics", icon: LineChart, color: ACCENT },
    { to: "apikeys", key: "apikeys", icon: Key, color: ACCENT },
    { to: "commands", key: "commands", icon: BookOpen, color: ACCENT },
    { to: "webhooks", key: "webhooks", icon: Webhook, color: ACCENT },
    { to: "premium", key: "premium", icon: Star, color: "bg-premium/10 text-premium" },
    { to: "settings", key: "settings", icon: Settings, color: "bg-cs-panel text-cs-muted" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Link key={c.to} to={c.to} className="cs-card !p-4 hover:border-cs-cyan/30 hover:bg-cs-panel transition-all flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.color}`} aria-hidden="true">
            <c.icon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-cs-text text-sm">{t(`nav.${c.key}`)}</h3>
            <p className="text-xs text-cs-muted mt-0.5">{t(`navDesc.${c.key}`)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── Първи стъпки (както преди — свито, щом всичко е готово) ────────── */
function GettingStarted({ serverId, panels, forms }) {
  const steps = [
    { label: "Invite the bot to your server", done: true, to: null },
    { label: "Create a ticket panel", done: (panels?.length ?? 0) > 0, to: `/dashboard/${serverId}/panels`, cta: "Create panel" },
    { label: "Spawn a panel in a channel", done: (panels || []).some((p) => p.channelId), to: `/dashboard/${serverId}/panels`, cta: "Spawn panel" },
    { label: "Build an application form", done: (forms?.length ?? 0) > 0, to: `/dashboard/${serverId}/forms`, cta: "Create form" },
  ];
  const allDone = steps.every((s) => s.done);
  const remaining = steps.filter((s) => !s.done).length;

  if (allDone) {
    return (
      <details className="cs-card mb-8 group">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 text-sm text-success font-semibold">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Setup complete — all first steps done
          <ArrowRight className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-90" aria-hidden="true" />
        </summary>
        <ol className="mt-4 space-y-2">{steps.map((s) => <ChecklistRow key={s.label} step={s} />)}</ol>
      </details>
    );
  }
  return (
    <div className="cs-card mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-cs-text">First steps</h2>
        <span className="text-xs text-cs-muted font-mono">{steps.length - remaining}/{steps.length} done</span>
      </div>
      <ol className="space-y-2">{steps.map((s) => <ChecklistRow key={s.label} step={s} />)}</ol>
    </div>
  );
}

function ChecklistRow({ step }) {
  const content = (
    <>
      {step.done
        ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" aria-hidden="true" />
        : <Circle className="w-4 h-4 text-cs-dim flex-shrink-0" aria-hidden="true" />}
      <span className={`text-sm flex-1 ${step.done ? "text-cs-muted line-through" : "text-cs-text"}`}>{step.label}</span>
      {!step.done && step.to && (
        <span className="text-xs text-cs-cyan font-mono flex items-center gap-1 flex-shrink-0">
          {step.cta} <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </span>
      )}
    </>
  );
  if (!step.done && step.to) {
    return <li><Link to={step.to} className="flex items-center gap-2.5 py-1.5 hover:opacity-80 transition-opacity no-underline">{content}</Link></li>;
  }
  return <li className="flex items-center gap-2.5 py-1.5">{content}</li>;
}

function OverviewSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-cs-panel animate-pulse" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-cs-panel rounded animate-pulse" />
          <div className="h-3 w-64 bg-cs-panel rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="cs-card h-[104px] animate-pulse bg-cs-panel" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="cs-card h-64 xl:col-span-2 animate-pulse bg-cs-panel" />
        <div className="cs-card h-64 animate-pulse bg-cs-panel" />
      </div>
    </div>
  );
}
