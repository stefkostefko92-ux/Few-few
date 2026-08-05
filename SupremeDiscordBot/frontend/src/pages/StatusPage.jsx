// frontend/src/pages/StatusPage.jsx
// Public-facing service status dashboard — no auth required.
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, Server, Database, Bot } from "lucide-react";
import { getStatus } from "../api";
import SupremeLogo, { SupremeWordmark } from "../components/SupremeLogo";
import Seo from "../components/Seo";

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
    <div className="min-h-screen bg-transparent flex flex-col">
      <Seo
        title="Service Status — Supreme Bot"
        description="Real-time service status for Supreme Bot: uptime and component health for the database, Discord bot, API, and web dashboard."
        path="/status"
      />
      <div className="max-w-3xl mx-auto py-12 px-6 w-full flex-1">
        <div className="flex items-center justify-between mb-8">
          <a href="/" className="flex items-center gap-3 group">
            <SupremeLogo size={36} />
            <div className="flex flex-col leading-tight">
              <SupremeWordmark className="text-base" />
              <span className="text-cs-dim text-[10px] font-mono uppercase tracking-[0.2em]">/ status</span>
            </div>
          </a>
          <button onClick={() => refetch()} className="text-cs-muted hover:text-white text-xs font-mono">
            REFRESH
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
          <p>Uptime commitment: 99.9% · Premium | 99.95% · Enterprise — measured monthly, backed by service credits</p>
          <p>Infrastructure: Hetzner (Germany) · EU-only data residency</p>
          <p>Status checks refresh every 30 seconds · Cache: 30s</p>
          <p className="pt-2">
            Report an issue: <a href="https://discord.gg/wpCRpy8B" className="text-cs-cyan underline">Discord support</a>
          </p>
        </div>
      </div>

      {/* ═══ Supreme footer ═══ */}
      <footer className="border-t border-cs-border bg-cs-bg mt-12">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SupremeLogo size={28} />
            <div className="flex flex-col leading-tight">
              <SupremeWordmark className="text-sm" />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-cs-dim">
                Created and Designed by{" "}
                <a
                  href="https://carbonstealth.eu"
                  target="_blank"
                  rel="noopener"
                  className="text-cs-cyan underline"
                >
                  Carbon Stealth VCC
                </a>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-cs-dim">
            <a href="/"        className="hover:text-cs-cyan transition-colors">Home</a>
            <a href="/terms"   className="hover:text-cs-cyan transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-cs-cyan transition-colors">Privacy</a>
            <a href="/accessibility" className="hover:text-cs-cyan transition-colors">Accessibility</a>
          </div>
        </div>
      </footer>
    </div>
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
