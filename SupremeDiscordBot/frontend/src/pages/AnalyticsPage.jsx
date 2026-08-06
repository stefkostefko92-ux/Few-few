// frontend/src/pages/AnalyticsPage.jsx
import { Fragment } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, TrendingUp, Ticket, FileText, Award, RefreshCw } from "lucide-react";
import {
  getAnalyticsOverview, getAnalyticsHeatmap,
  getAnalyticsLeaderboard, getAnalyticsFunnel,
} from "../api";
import { useT } from "../contexts/I18nContext";

export default function AnalyticsPage() {
  const { t } = useT();
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
          <BarChart3 className="w-7 h-7 text-cs-cyan" /> {t("analytics.title")}
        </h1>
        <p className="text-cs-muted mt-2 max-w-2xl">
          {t("analytics.subtitle")}
        </p>
      </div>

      {/* ═══ KPI cards ═══ */}
      {overviewQ.isError ? (
        <RetryCard className="mb-8" message={t("analytics.err.overview")} onRetry={() => overviewQ.refetch()} isRefetching={overviewQ.isRefetching} t={t} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Kpi icon={Ticket} label={t("analytics.totalTickets")}     value={overview?.tickets?.total ?? "—"} />
          <Kpi icon={Ticket} label={t("analytics.open")}             value={overview?.tickets?.open ?? "—"} accent />
          <Kpi icon={FileText} label={t("analytics.applications")}   value={overview?.applications?.total ?? "—"} />
          <Kpi icon={TrendingUp} label={t("analytics.approvalRate")} value={overview?.applications?.approvalRate !== undefined ? `${overview.applications.approvalRate}%` : "—"} />
        </div>
      )}

      {/* ═══ Heatmap ═══ */}
      <section className="cs-card mb-6">
        <h2 className="text-lg font-bold text-cs-text mb-1">{t("analytics.heatmap")}</h2>
        <p className="text-xs text-cs-muted mb-4">{t("analytics.heatmapMeta", { count: heatmap?.total ?? 0 })}</p>
        {heatmapQ.isError ? (
          <RetryCard message={t("analytics.err.heatmap")} onRetry={() => heatmapQ.refetch()} isRefetching={heatmapQ.isRefetching} t={t} />
        ) : heatmap?.grid ? <Heatmap grid={heatmap.grid} t={t} /> : (
          <div className="h-48 animate-pulse bg-cs-surface rounded" role="status">
            <span className="sr-only">{t("analytics.loadingHeatmap")}</span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ═══ Leaderboard ═══ */}
        <section className="cs-card">
          <h2 className="text-lg font-bold text-cs-text mb-1 flex items-center gap-2">
            <Award className="w-5 h-5 text-cs-gold" /> {t("analytics.leaderboard")}
          </h2>
          <p className="text-xs text-cs-muted mb-4">{t("analytics.leaderboardMeta")}</p>
          {leaderboardQ.isError ? (
            <RetryCard message={t("analytics.err.leaderboard")} onRetry={() => leaderboardQ.refetch()} isRefetching={leaderboardQ.isRefetching} t={t} />
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
                    <span className="text-cs-cyan">{t("analytics.claimed", { count: s.claimed })}</span>
                    <span className="text-success">{t("analytics.closed", { count: s.closed })}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-cs-dim text-sm">{t("analytics.noStaff")}</div>
          )}
        </section>

        {/* ═══ Funnel ═══ */}
        <section className="cs-card">
          <h2 className="text-lg font-bold text-cs-text mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-cs-cyan" /> {t("analytics.funnel")}
          </h2>
          <p className="text-xs text-cs-muted mb-4">{t("analytics.funnelMeta")}</p>
          {funnelQ.isError ? (
            <RetryCard message={t("analytics.err.funnel")} onRetry={() => funnelQ.refetch()} isRefetching={funnelQ.isRefetching} t={t} />
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
            <div className="text-cs-dim text-sm">{t("analytics.noApps")}</div>
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

function RetryCard({ message, onRetry, isRefetching, className = "", t }) {
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
        {isRefetching ? t("analytics.retrying") : t("analytics.retry")}
      </button>
    </div>
  );
}

function Heatmap({ grid, t }) {
  const days = t("analytics.days").split(",");
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
                  aria-label={t("analytics.cell", { day: days[d], hour: h, count: val })}
                  title={t("analytics.cell", { day: days[d], hour: h, count: val })}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
