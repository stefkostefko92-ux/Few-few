// frontend/src/pages/Dashboard.jsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PlusCircle, AlertCircle } from "lucide-react";
import { getServers } from "../api";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: servers = [], isLoading, error } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=8&scope=bot+applications.commands`;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Your Servers</h1>
        <p className="text-gray-400">Select a server to manage its bot settings.</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-dark-100" />
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          Failed to load servers. Please refresh.
        </div>
      )}

      {!isLoading && (
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
            className="card border-dashed border-2 border-white/10 hover:border-discord-500/50 flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-discord-400 transition-colors cursor-pointer min-h-[100px]"
          >
            <PlusCircle className="w-8 h-8" />
            <span className="font-medium">Add to a Server</span>
          </a>
        </div>
      )}
    </div>
  );
}

function ServerCard({ server, onActivate, inviteUrl }) {
  const avatar = server.icon ? (
    <img src={server.icon} alt={server.name} className="w-12 h-12 rounded-full flex-shrink-0" />
  ) : (
    <div className="w-12 h-12 rounded-full bg-discord-500/20 flex items-center justify-center flex-shrink-0">
      <span className="text-discord-400 font-bold text-lg">{server.name[0]}</span>
    </div>
  );

  // Active servers navigate — render as a real, keyboard-operable button.
  if (server.botAdded) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="card flex items-center gap-4 transition-all text-left w-full cursor-pointer hover:border-discord-500/30 hover:bg-dark-100"
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{server.name}</span>
            {server.isPremium && <span className="badge-premium">⭐ Premium</span>}
          </div>
          <span className="text-xs text-green-400 mt-0.5 block">Bot Active</span>
        </div>
      </button>
    );
  }

  // Inactive servers aren't navigable; the only action is the Invite link.
  return (
    <div className="card flex items-center gap-4 transition-all opacity-60">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-white truncate">{server.name}</p>
          {server.isPremium && <span className="badge-premium">⭐ Premium</span>}
        </div>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-discord-400 hover:underline mt-0.5 block"
        >
          + Invite Bot
        </a>
      </div>
    </div>
  );
}
