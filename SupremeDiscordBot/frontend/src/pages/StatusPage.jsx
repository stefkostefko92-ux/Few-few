// frontend/src/pages/StatusPage.jsx
// Public-facing service status dashboard — no auth required.
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, Server, Database, Bot } from "lucide-react";
import { getStatus } from "../api";
import Seo from "../components/Seo";
import PublicPageLayout from "../components/PublicPageLayout";

export default function StatusPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["public-status"],
    queryFn: getStatus,
    refetchInterval: 30_000,
  });

  const overall = data?.status || "unknown";
  const overallConfig = {
    operational: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: CheckCircle2, label: "All systems operational" },
    degraded:    { color: "text-warning", bg: "bg-warning/10 border-warning/30", icon: AlertTriangle, label: "Partial outage" },
    down:        { color: "text-red-400",   bg: "bg-red-500/10 border-red-500/30",     icon: XCircle,      label: "Major outage" },
    unknown:     { color: "text-cs-dim",    bg: "bg-cs-surface border-cs-border",      icon: AlertTriangle, label: "Status unknown" },
  }[overall] || { color: "text-cs-dim", bg: "", icon: AlertTriangle, label: "Unknown" };
  const OverallIcon = overallConfig.icon;

  return (
    <PublicPageLayout crumb="Status" maxWidth="max-w-3xl">
      <Seo
        title="Service Status — Supreme Bot"
        description="Real-time service status for Supreme Bot: uptime and component health for the database, Discord bot, API, and web dashboard."
        path="/status"
      />
      <div>
        <div className="flex items-center justify-end mb-6">
          <button type="button" onClick={() => refetch()} className="text-sm text-site-steel hover:text-site-chrome underline underline-offset-4 decoration-site-line">
            Refresh
          </button>
        </div>

        {/* ═══ Overall badge ═══ */}
        <div className={`cs-card border-2 mb-8 ${overallConfig.bg}`}>
          <div className="flex items-center gap-3">
            <OverallIcon className={`w-8 h-8 ${overallConfig.color}`} />
            <div>
              <h1 className={`text-2xl font-bold ${overallConfig.color}`}>{overallConfig.label}</h1>
              {data?.timestamp && (
                <p className="text-xs text-cs-dim font-mono mt-1">
                  Last checked: {new Date(data.timestamp).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ Services list ═══ */}
        <h2 className="text-xs text-cs-muted uppercase tracking-wider font-mono mb-3">Services</h2>
        {isLoading && <div className="cs-card h-20 animate-pulse" />}

        <div className="space-y-2 mb-8">
          <ServiceRow
            icon={Database}
            name="Database"
            description="PostgreSQL cluster"
            status={data?.services?.database?.status}
            latency={data?.services?.database?.latencyMs}
          />
          <ServiceRow
            icon={Bot}
            name="Bot Gateway"
            description="Discord bot API"
            status={data?.services?.bot?.status}
            latency={data?.services?.bot?.latencyMs}
          />
          <ServiceRow
            icon={Server}
            name="Cache Layer"
            description="Redis session + rate limits"
            status={data?.services?.cache?.status}
          />
        </div>

        {/* ═══ Stats ═══ */}
        {data?.stats && (
          <>
            <h2 className="text-xs text-cs-muted uppercase tracking-wider font-mono mb-3">Platform Stats</h2>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="cs-card !p-4">
                <div className="text-xs text-cs-muted uppercase tracking-wider font-mono">Total Servers</div>
                <div className="text-2xl font-black text-cs-text mt-1">{data.stats.totalServers}</div>
              </div>
              <div className="cs-card !p-4">
                <div className="text-xs text-cs-muted uppercase tracking-wider font-mono">Active (24h)</div>
                <div className="text-2xl font-black text-cs-cyan mt-1">{data.stats.activeServers24h}</div>
              </div>
            </div>
          </>
        )}

        {/* ═══ SLA info ═══ */}
        <div className="border-t border-cs-border pt-6 text-xs text-cs-dim font-mono space-y-1">
          {/* Обявявахме „99.9% Premium | 99.95% Enterprise — backed by service
              credits“. Три неверни неща наведнъж: „Enterprise“ план НЕ съществува
              в ценоразписа, service credits ги НЯМА в Общите условия/EULA, а
              EULA §12.1 изрично казва, че специфична гаранция за uptime не се
              предлага (Premium може да ДОГОВОРИ SLA). Реклама на договорна
              гаранция, която никой документ не подкрепя, е заблуждаваща търговска
              практика (Дир. 2005/29/ЕО) — и първият клиент, поискал кредит, го
              открива. Текстът вече казва каквото е вярно: цел, не гаранция. */}
          <p>Uptime target: 99.9% — monitored continuously. No contractual SLA is included by default; Premium subscribers may negotiate one (EULA §12.1).</p>
          <p>Infrastructure: Hetzner (Germany); Discord, Google and Sentry act as US sub-processors under SCCs (Privacy Policy §5–6)</p>
          <p>Status checks refresh every 30 seconds · Cache: 30s</p>
          <p className="pt-2">
            Report an issue: <a href="https://discord.gg/wpCRpy8B" className="text-cs-cyan underline">Discord support</a>
          </p>
        </div>
      </div>

    </PublicPageLayout>
  );
}

function ServiceRow({ icon: Icon, name, description, status, latency }) {
  const config = {
    operational: { color: "text-green-400", label: "Operational", StatusIcon: CheckCircle2 },
    down:        { color: "text-red-400",   label: "Down",        StatusIcon: XCircle },
    degraded:    { color: "text-warning", label: "Degraded",    StatusIcon: AlertTriangle },
  }[status] || { color: "text-cs-dim", label: "Unknown", StatusIcon: AlertTriangle };
  const { StatusIcon } = config;

  return (
    <div className="cs-card flex items-center justify-between !p-4">
      <div className="flex items-center gap-3 flex-1">
        <Icon className="w-5 h-5 text-cs-cyan flex-shrink-0" />
        <div>
          <div className="text-cs-text font-bold">{name}</div>
          <div className="text-xs text-cs-muted">{description}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {latency != null && (
          <span className="text-xs font-mono text-cs-dim">{latency}ms</span>
        )}
        <div className={`flex items-center gap-2 ${config.color}`}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-sm font-bold">{config.label}</span>
        </div>
      </div>
    </div>
  );
}
