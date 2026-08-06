// frontend/src/pages/Dashboard.jsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusCircle, AlertCircle, RefreshCw, Star } from "lucide-react";
import { getServers } from "../api";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

export default function Dashboard() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Agency checkout връщане: ?agency=active / ?agency=canceled (success_url
  // на /agency/checkout сочи насам). Тост веднъж + чист URL — както
  // per-server ?upgraded= на ServerHome.
  useEffect(() => {
    const agency = searchParams.get("agency");
    if (agency === "active") toast.success(t("agency.checkoutSuccess"));
    else if (agency === "canceled") toast.error(t("agency.checkoutCanceled"));
    else return;
    const next = new URLSearchParams(searchParams);
    next.delete("agency");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: servers = [], isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=361045814288&scope=bot+applications.commands`;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-cs-text mb-2">{t("dashboard.yourServers")}</h1>
        <p className="text-cs-muted">Select a server to manage its bot settings.</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cs-card h-24 animate-pulse bg-cs-panel" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 text-center text-danger bg-danger/10 border border-danger/20 rounded-xl p-8"
        >
          <AlertCircle className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
          <p>Failed to load servers.</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="cs-btn-secondary text-xs flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
            {isRefetching ? t("common.retrying") : "Retry"}
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onActivate={() => navigate(`/dashboard/${server.id}`)}
              inviteUrl={BOT_INVITE_URL}
            />
          ))}

          {/* Add new server card */}
          <a
            href={BOT_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cs-card border-dashed border-2 border-cs-border hover:border-cs-cyan/50 flex flex-col items-center justify-center gap-3 text-cs-muted hover:text-cs-cyan transition-colors cursor-pointer min-h-[100px]"
          >
            <PlusCircle className="w-8 h-8" />
            <span className="font-medium">{t("dashboard.addToServer")}</span>
          </a>
        </div>
      )}
    </div>
  );
}

function ServerCard({ server, onActivate, inviteUrl }) {
  const { t } = useT();
  const avatar = server.icon ? (
    <img src={server.icon} alt={server.name} className="w-12 h-12 rounded-full flex-shrink-0" />
  ) : (
    <div className="w-12 h-12 rounded-full bg-cs-cyanGlow flex items-center justify-center flex-shrink-0">
      <span className="text-cs-cyan font-bold text-lg">{server.name[0]}</span>
    </div>
  );

  // Active servers navigate — render as a real, keyboard-operable button.
  if (server.botAdded) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="cs-card flex items-center gap-4 transition-all text-left w-full cursor-pointer hover:border-cs-cyan/30 hover:bg-cs-panel"
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-cs-text truncate">{server.name}</span>
            {server.isPremium && (
              <span className="cs-badge-premium">
                <Star className="w-3 h-3" aria-hidden="true" /> Premium
              </span>
            )}
          </div>
          <span className="text-xs text-success mt-0.5 block">{t("dashboard.botActive")}</span>
        </div>
      </button>
    );
  }

  // Inactive servers aren't navigable; the only action is the Invite link.
  return (
    <div className="cs-card flex items-center gap-4 transition-all opacity-60">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-cs-text truncate">{server.name}</p>
          {server.isPremium && (
            <span className="cs-badge-premium">
              <Star className="w-3 h-3" aria-hidden="true" /> Premium
            </span>
          )}
        </div>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cs-cyan hover:underline mt-0.5 block"
        >
          + Invite Bot
        </a>
      </div>
    </div>
  );
}
