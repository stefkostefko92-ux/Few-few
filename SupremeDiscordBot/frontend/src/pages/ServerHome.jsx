// frontend/src/pages/ServerHome.jsx
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket, FileText, Layout, Star, Users,
  ShieldCheck, Zap, LineChart, Key, BookOpen, Webhook, Settings, Bot,
  CheckCircle2, Circle, ArrowRight,
} from "lucide-react";
import { getServer, getServerStats, getPanels, getForms } from "../api";

export default function ServerHome() {
  const { serverId } = useParams();

  const { data: server, isLoading: serverLoading, isError: serverError } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
    retry: 1,
  });
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", serverId],
    queryFn: () => getServerStats(serverId),
    enabled: !!server,
  });
  // Getting-started checklist — derived from real data already fetched
  // elsewhere in the dashboard (panels/forms), no new backend endpoint.
  const { data: panels } = useQuery({
    queryKey: ["panels", serverId],
    queryFn: () => getPanels(serverId),
    enabled: !!server,
  });
  const { data: forms } = useQuery({
    queryKey: ["forms", serverId],
    queryFn: () => getForms(serverId),
    enabled: !!server,
  });

  // Монохромна дисциплина: cyan-accent за всичко + gold само за Premium (семантично)
  // и неутрален muted за Settings. Макс 3 семантични цвята вместо 12-цветна дъга.
  const ACCENT = "bg-cs-cyanGlow text-cs-cyan";
  const navCards = [
    { to: "panels", icon: <Layout className="w-6 h-6" />, label: "Panels", desc: "Visual button panels for tickets", color: ACCENT },
    { to: "forms", icon: <FileText className="w-6 h-6" />, label: "Forms", desc: "Logic-branching questionnaires", color: ACCENT },
    { to: "tickets", icon: <Ticket className="w-6 h-6" />, label: "Tickets", desc: "View & manage support tickets", color: ACCENT },
    { to: "applications", icon: <Users className="w-6 h-6" />, label: "Applications", desc: "Review member applications", color: ACCENT },
    { to: "verification", icon: <ShieldCheck className="w-6 h-6" />, label: "Verification", desc: "Gate new members with verification", color: ACCENT },
    { to: "automation", icon: <Zap className="w-6 h-6" />, label: "Automation", desc: "Triggers, rules & auto-actions", color: ACCENT },
    { to: "analytics", icon: <LineChart className="w-6 h-6" />, label: "Analytics", desc: "Ticket & member insights", color: ACCENT },
    { to: "apikeys", icon: <Key className="w-6 h-6" />, label: "API Keys", desc: "Programmatic access tokens", color: ACCENT },
    { to: "commands", icon: <BookOpen className="w-6 h-6" />, label: "Commands", desc: "Configure slash commands", color: ACCENT },
    { to: "webhooks", icon: <Webhook className="w-6 h-6" />, label: "Webhooks", desc: "Outbound event notifications", color: ACCENT },
    { to: "premium", icon: <Star className="w-6 h-6" />, label: "Premium", desc: "Subscription & advanced features", color: "bg-premium/10 text-premium" },
    { to: "settings", icon: <Settings className="w-6 h-6" />, label: "Settings", desc: "General bot configuration", color: "bg-cs-panel text-cs-muted" },
  ];

  if (serverLoading) {
    return (
      <div className="p-8">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-cs-panel animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-48 bg-cs-panel rounded animate-pulse" />
            <div className="h-4 w-32 bg-cs-panel rounded animate-pulse" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />
          ))}
        </div>
        {/* Nav cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />
          ))}
        </div>
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64 text-center" role="alert">
        <Bot className="w-10 h-10 text-cs-cyan mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-cs-text mb-2">Bot not set up for this server</h2>
        <p className="text-cs-muted text-sm">The bot hasn't been added to this server yet, or hasn't synced.</p>
        <a
          href={`https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814288&scope=bot+applications.commands&guild_id=${serverId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="cs-btn-primary mt-4 inline-flex items-center gap-2"
        >
          Invite Bot to Server
        </a>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {server?.icon ? (
          <img src={server.icon} alt={server.name} className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-cs-cyan/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-cs-cyan">{server?.name?.[0]}</span>
          </div>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-cs-text">{server?.name}</h1>
            {server?.isPremium && (
              <span className="cs-badge-premium">
                <Star className="w-3 h-3" aria-hidden="true" /> Premium
              </span>
            )}
          </div>
          <p className="text-cs-muted text-sm">Server ID: {serverId}</p>
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Tickets" value={stats.ticketCount} color="text-cs-cyan" />
          <StatCard label="Open Tickets" value={stats.openTickets} color="text-cs-cyan" />
          <StatCard label="Closed (7 Days)" value={stats.closedThisWeek} color="text-cs-cyan" />
          <StatCard label="Applications" value={stats.applications} color="text-cs-cyan" />
        </div>
      ) : null}

      {/* Getting started */}
      <GettingStarted serverId={serverId} panels={panels} forms={forms} />

      {/* Navigation cards */}
      <h2 className="text-lg font-semibold text-cs-text mb-4">Manage this server</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="cs-card hover:border-white/10 hover:bg-cs-panel transition-all flex items-start gap-4"
          >
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${card.color}`} aria-hidden="true">
              {card.icon}
            </div>
            <div>
              <h3 className="font-semibold text-cs-text">{card.label}</h3>
              <p className="text-sm text-cs-muted mt-0.5">{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* First-run checklist — steps are computed from data already fetched on this
   page (panels, forms) plus the invite that got us here. Collapses to a
   compact "All set" summary once every step is done instead of disappearing,
   so returning users still see the confirmation once. */
function GettingStarted({ serverId, panels, forms }) {
  const steps = [
    {
      label: "Invite the bot to your server",
      done: true, // reaching this page at all means the bot is added & synced
      to: null,
    },
    {
      label: "Create a ticket panel",
      done: (panels?.length ?? 0) > 0,
      to: `/dashboard/${serverId}/panels`,
      cta: "Create panel",
    },
    {
      label: "Spawn a panel in a channel",
      done: (panels || []).some((p) => p.channelId),
      to: `/dashboard/${serverId}/panels`,
      cta: "Spawn panel",
    },
    {
      label: "Build an application form",
      done: (forms?.length ?? 0) > 0,
      to: `/dashboard/${serverId}/forms`,
      cta: "Create form",
    },
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
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <ChecklistRow key={s.label} step={s} />
          ))}
        </ol>
      </details>
    );
  }

  return (
    <div className="cs-card mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-cs-text">First steps</h2>
        <span className="text-xs text-cs-muted font-mono">{steps.length - remaining}/{steps.length} done</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <ChecklistRow key={s.label} step={s} />
        ))}
      </ol>
    </div>
  );
}

function ChecklistRow({ step }) {
  const content = (
    <>
      {step.done
        ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" aria-hidden="true" />
        : <Circle className="w-4 h-4 text-cs-dim flex-shrink-0" aria-hidden="true" />}
      <span className={`text-sm flex-1 ${step.done ? "text-cs-muted line-through" : "text-cs-text"}`}>
        {step.label}
      </span>
      {!step.done && step.to && (
        <span className="text-xs text-cs-cyan font-mono flex items-center gap-1 flex-shrink-0">
          {step.cta} <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </span>
      )}
    </>
  );

  if (!step.done && step.to) {
    return (
      <li>
        <Link to={step.to} className="flex items-center gap-2.5 py-1.5 hover:opacity-80 transition-opacity">
          {content}
        </Link>
      </li>
    );
  }
  return <li className="flex items-center gap-2.5 py-1.5">{content}</li>;
}

function StatCard({ label, value, color }) {
  return (
    <div className="cs-card">
      <p className="text-sm text-cs-muted">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? "—"}</p>
    </div>
  );
}
