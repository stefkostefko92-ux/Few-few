// frontend/src/pages/ServerHome.jsx
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket, FileText, Layout, Star, Users,
  ShieldCheck, Zap, LineChart, Key, BookOpen, Webhook, Settings,
} from "lucide-react";
import { getServer, getServerStats } from "../api";

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

  const navCards = [
    { to: "panels", icon: <Layout className="w-6 h-6" />, label: "Panels", desc: "Visual button panels for tickets", color: "bg-blue-500/10 text-blue-400" },
    { to: "forms", icon: <FileText className="w-6 h-6" />, label: "Forms", desc: "Logic-branching questionnaires", color: "bg-purple-500/10 text-purple-400" },
    { to: "tickets", icon: <Ticket className="w-6 h-6" />, label: "Tickets", desc: "View & manage support tickets", color: "bg-green-500/10 text-green-400" },
    { to: "applications", icon: <Users className="w-6 h-6" />, label: "Applications", desc: "Review member applications", color: "bg-yellow-500/10 text-yellow-400" },
    { to: "verification", icon: <ShieldCheck className="w-6 h-6" />, label: "Verification", desc: "Gate new members with verification", color: "bg-teal-500/10 text-teal-400" },
    { to: "automation", icon: <Zap className="w-6 h-6" />, label: "Automation", desc: "Triggers, rules & auto-actions", color: "bg-pink-500/10 text-pink-400" },
    { to: "analytics", icon: <LineChart className="w-6 h-6" />, label: "Analytics", desc: "Ticket & member insights", color: "bg-cyan-500/10 text-cyan-400" },
    { to: "apikeys", icon: <Key className="w-6 h-6" />, label: "API Keys", desc: "Programmatic access tokens", color: "bg-indigo-500/10 text-indigo-400" },
    { to: "commands", icon: <BookOpen className="w-6 h-6" />, label: "Commands", desc: "Configure slash commands", color: "bg-emerald-500/10 text-emerald-400" },
    { to: "webhooks", icon: <Webhook className="w-6 h-6" />, label: "Webhooks", desc: "Outbound event notifications", color: "bg-rose-500/10 text-rose-400" },
    { to: "premium", icon: <Star className="w-6 h-6" />, label: "Premium", desc: "Subscription & advanced features", color: "bg-orange-500/10 text-orange-400" },
    { to: "settings", icon: <Settings className="w-6 h-6" />, label: "Settings", desc: "General bot configuration", color: "bg-gray-500/10 text-gray-300" },
  ];

  if (serverLoading) {
    return (
      <div className="p-8">
        {/* Header skeleton */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-dark-100 animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-48 bg-dark-100 rounded animate-pulse" />
            <div className="h-4 w-32 bg-dark-100 rounded animate-pulse" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-dark-100" />
          ))}
        </div>
        {/* Nav cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-dark-100" />
          ))}
        </div>
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64 text-center" role="alert">
        <p className="text-2xl mb-2" aria-hidden="true">🤖</p>
        <h2 className="text-lg font-semibold text-white mb-2">Bot not set up for this server</h2>
        <p className="text-gray-400 text-sm">The bot hasn't been added to this server yet, or hasn't synced.</p>
        <a
          href={`https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_CLIENT_ID}&permissions=8&scope=bot+applications.commands&guild_id=${serverId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-4 inline-flex items-center gap-2"
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
          <div className="w-16 h-16 rounded-full bg-discord-500/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-discord-400">{server?.name?.[0]}</span>
          </div>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{server?.name}</h1>
            {server?.isPremium && <span className="badge-premium">⭐ Premium</span>}
          </div>
          <p className="text-gray-400 text-sm">Server ID: {serverId}</p>
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-dark-100" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Tickets" value={stats.ticketCount} color="text-blue-400" />
          <StatCard label="Open Tickets" value={stats.openTickets} color="text-yellow-400" />
          <StatCard label="Closed (7 Days)" value={stats.closedThisWeek} color="text-green-400" />
          <StatCard label="Applications" value={stats.applications} color="text-purple-400" />
        </div>
      ) : null}

      {/* Navigation cards */}
      <h2 className="text-lg font-semibold text-white mb-4">Manage this server</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {navCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="card hover:border-white/10 hover:bg-dark-100 transition-all flex items-start gap-4"
          >
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${card.color}`} aria-hidden="true">
              {card.icon}
            </div>
            <div>
              <h3 className="font-semibold text-white">{card.label}</h3>
              <p className="text-sm text-gray-400 mt-0.5">{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? "—"}</p>
    </div>
  );
}
