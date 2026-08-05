// frontend/src/pages/AnalyticsPage.jsx
import { Fragment } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, TrendingUp, Ticket, FileText, Award, RefreshCw } from "lucide-react";
import {
  getAnalyticsOverview, getAnalyticsHeatmap,
  getAnalyticsLeaderboard, getAnalyticsFunnel,
} from "../api";

export default function AnalyticsPage() {
  const { serverId } = useParams();

  const overviewQ = useQuery({ queryKey: ["analytics-overview", serverId], queryFn: () => getAnalyticsOverview(serverId) });
  const heatmapQ  = useQuery({ queryKey: ["analytics-heatmap", serverId],  queryFn: () => getAnalyticsHeatmap(serverId) });
  const leaderboardQ = useQuery({ queryKey: ["analytics-leaderboard", serverId], queryFn: () => getAnalyticsLeaderboard(serverId) });
  const funnelQ = useQuery({ queryKey: ["analytics-funnel", serverId], queryFn: () => getAnalyticsFunnel(serverId) });

  const { data: overview } = overviewQ;
  const { data: heatmap } = heatmapQ;
  const { data: leaderboard } = leaderboardQ;
  const { data: funnel } = funnelQ;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-cs-cyan" /> Analytics
        </h1>
        <p className="text-cs-muted mt-2 max-w-2xl">
          Performance insights across tickets, applications, and verification.
          Daily metrics snapshot at 00:05 UTC; heatmap covers last 90 days.
        </p>
      </div>

      {/* ═══ KPI cards ═══ */}
      {overviewQ.isError ? (
        <RetryCard className="mb-8" message="Couldn't load the overview metrics." onRetry={() => overviewQ.refetch()} isRefetching={overviewQ.isRefetching} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Kpi icon={Ticket} label="Total Tickets"     value={overview?.tickets?.total ?? "—"} />
          <Kpi icon={Ticket} label="Open"              value={overview?.tickets?.open ?? "—"} accent />
          <Kpi icon={FileText} label="Applications"    value={overview?.applications?.total ?? "—"} />
          <Kpi icon={TrendingUp} label="Approval Rate" value={overview?.applications?.approvalRate !== undefined ? `${overview.applications.approvalRate}%` : "—"} />
        </div>
      )}

      {/* ═══ Heatmap ═══ */}
      <section className="cs-card mb-6">
        <h2 className="text-lg font-bold text-cs-text mb-1">Ticket Activity Heatmap</h2>
        <p className="text-xs text-cs-muted mb-4">UTC · Last 90 days · {heatmap?.total ?? 0} tickets</p>
        {heatmapQ.isError ? (
          <RetryCard message="Couldn't load the activity heatmap." onRetry={() => heatmapQ.refetch()} isRefetching={heatmapQ.isRefetching} />
        ) : heatmap?.grid ? <Heatmap grid={heatmap.grid} /> : (
          <div className="h-48 animate-pulse bg-cs-surface rounded" role="status">
            <span className="sr-only">Loading heatmap…</span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ═══ Leaderboard ═══ */}
        <section className="cs-card">
          <h2 className="text-lg font-bold text-cs-text mb-1 flex items-center gap-2">
            <Award className="w-5 h-5 text-cs-gold" /> Staff Leaderboard
          </h2>
          <p className="text-xs text-cs-muted mb-4">30 days · Sorted by activity</p>
          {leaderboardQ.isError ? (
            <RetryCard message="Couldn't load the leaderboard." onRetry={() => leaderboardQ.refetch()} isRefetching={leaderboardQ.isRefetching} />
          ) : leaderboard?.leaderboard?.length ? (
            <div className="space-y-2">
              {leaderboard.leaderboard.map((s, i) => (
                <div key={s.userId} className="flex items-center justify-between py-2 border-b border-cs-border last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? "bg-cs-gold text-black" :
                      i === 1 ? "bg-gray-300 text-black" :
                      i === 2 ? "bg-amber-700 text-white" :
                      "bg-cs-surface text-cs-muted"
                    }`}>
                      {i + 1}
                    </div>
                    <span className="font-mono text-xs text-cs-text">&lt;@{s.userId}&gt;</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-cs-cyan">{s.claimed} claimed</span>
                    <span className="text-success">{s.closed} closed</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-cs-dim text-sm">No staff activity in last 30 days.</div>
          )}
        </section>

        {/* ═══ Funnel ═══ */}
        <section className="cs-card">
          <h2 className="text-lg font-bold text-cs-text mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-cs-cyan" /> Application Funnel
          </h2>
          <p className="text-xs text-cs-muted mb-4">90 days · Conversion stages</p>
          {funnelQ.isError ? (
            <RetryCard message="Couldn't load the funnel." onRetry={() => funnelQ.refetch()} isRefetching={funnelQ.isRefetching} />
          ) : funnel?.stages?.length ? (
            <div className="space-y-3">
              {funnel.stages.map((st) => (
                <div key={st.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-cs-text font-bold">{st.label}</span>
                    <span className="text-cs-muted">{st.count} ({st.pct}%)</span>
                  </div>
                  <div className="h-2 bg-cs-surface rounded overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cs-cyan to-cs-gold transition-all"
                      style={{ width: `${st.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-cs-dim text-sm">No application data.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className={`cs-card !p-4 ${accent ? "border-cs-cyan/40" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent ? "text-cs-cyan" : "text-cs-muted"}`} />
        <span className="text-xs text-cs-muted uppercase tracking-wider font-mono">{label}</span>
      </div>
      <div className={`text-2xl font-black ${accent ? "text-cs-cyan" : "text-cs-text"}`}>{value}</div>
    </div>
  );
}

function RetryCard({ message, onRetry, isRefetching, className = "" }) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-3 text-center py-8 ${className}`}>
      <p className="text-danger text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRefetching}
        className="cs-btn-secondary text-xs flex items-center gap-2 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
        {isRefetching ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

function Heatmap({ grid }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const maxVal = Math.max(1, ...grid.flat());

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid" style={{ gridTemplateColumns: "auto repeat(24, 16px)", gap: "2px" }}>
        <div />
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="text-[8px] text-cs-dim text-center font-mono">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
        {grid.map((row, d) => (
          <Fragment key={d}>
            <div className="text-[10px] text-cs-dim font-mono pr-2 flex items-center">{days[d]}</div>
            {row.map((val, h) => {
              const intensity = val / maxVal;
              const bg = intensity === 0
                ? "rgba(255,255,255,0.04)"
                : `rgba(51, 177, 255, ${Math.max(0.15, intensity)})`;
              return (
                <div
                  key={`${d}-${h}`}
                  className="w-4 h-4 rounded-sm"
                  style={{ background: bg }}
                  role="img"
                  aria-label={`${days[d]} ${h}:00 — ${val} tickets`}
                  title={`${days[d]} ${h}:00 — ${val} tickets`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
