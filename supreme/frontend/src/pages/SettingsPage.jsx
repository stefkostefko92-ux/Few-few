// frontend/src/pages/SettingsPage.jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Hash, Bot, Zap, RefreshCw } from "lucide-react";
import { getServer, updateServer } from "../api";

export default function SettingsPage() {
  const { serverId } = useParams();
  const qc = useQueryClient();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
  });

  const [form, setForm] = useState(null);

  useEffect(() => {
    if (server && !form) {
      setForm({
        logChannelId: server.logChannelId || "",
        archiveChannelId: server.archiveChannelId || "",
        // White-label
        customBotName: server.customBotName || "",
        customBotAvatar: server.customBotAvatar || "",
        customBotToken: "", // Never pre-fill token for security
        // AI Replies
        aiRepliesEnabled: server.aiRepliesEnabled || false,
        aiRepliesPrompt: server.aiRepliesPrompt || "",
        // Round-Robin
        roundRobinEnabled: server.roundRobinEnabled || false,
        roundRobinRoleId: server.roundRobinRoleId || "",
        // v1.6 Welcomer + Autorole
        welcomerEnabled:    server.welcomerEnabled || false,
        welcomerChannelId:  server.welcomerChannelId || "",
        welcomerMessage:    server.welcomerMessage || "",
        welcomerEmbedColor: server.welcomerEmbedColor || "#00e5ff",
        welcomerDmEnabled:  server.welcomerDmEnabled || false,
        welcomerDmMessage:  server.welcomerDmMessage || "",
        autoroleIds:        (server.autoroleIds || []).join(","),
        autoroleBotIds:     (server.autoroleBotIds || []).join(","),
      });
    }
  }, [server]);

  const mutation = useMutation({
    mutationFn: (data) => updateServer(serverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", serverId] });
      setForm((f) => f ? { ...f, customBotToken: "" } : f);
    },
  });

  if (isLoading || !form) {
    return (
      <div className="p-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-16 animate-pulse bg-dark-100" />
        ))}
      </div>
    );
  }

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const csvToArr = (s) => (s || "").split(",").map(x => x.trim()).filter(Boolean);
    const payload = {
      logChannelId: form.logChannelId || null,
      archiveChannelId: form.archiveChannelId || null,
      // v1.6 appy.bot parity — available to all tiers
      welcomerEnabled:    form.welcomerEnabled,
      welcomerChannelId:  form.welcomerChannelId || null,
      welcomerMessage:    form.welcomerMessage || null,
      welcomerEmbedColor: form.welcomerEmbedColor,
      welcomerDmEnabled:  form.welcomerDmEnabled,
      welcomerDmMessage:  form.welcomerDmMessage || null,
      autoroleIds:        csvToArr(form.autoroleIds),
      autoroleBotIds:     csvToArr(form.autoroleBotIds),
      ...(server.isPremium && {
        customBotName: form.customBotName || null,
        customBotAvatar: form.customBotAvatar || null,
        ...(form.customBotToken && { customBotToken: form.customBotToken }),
        aiRepliesEnabled: form.aiRepliesEnabled,
        aiRepliesPrompt: form.aiRepliesPrompt || null,
        roundRobinEnabled: form.roundRobinEnabled,
        roundRobinRoleId: form.roundRobinRoleId || null,
      }),
    };
    mutation.mutate(payload);
  };

  const isPremium = server?.isPremium;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Server Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure bot behaviour for this server</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── General ─────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-white">General</h2>

          <label className="block">
            <span className="label">Log Channel ID</span>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Discord channel ID for bot activity logs"
                value={form.logChannelId}
                onChange={(e) => set("logChannelId", e.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="label">Archive Channel ID</span>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Channel where ticket transcripts are posted on close"
                value={form.archiveChannelId}
                onChange={(e) => set("archiveChannelId", e.target.value)}
              />
            </div>
          </label>
        </div>

        {/* ── AI Auto-Replies (Premium) ─────────────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h2 className="font-semibold text-white">AI Auto-Replies</h2>
            </div>
            {!isPremium && <span className="badge-base text-xs">⭐ Premium Only</span>}
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-discord-500"
              checked={form.aiRepliesEnabled}
              onChange={(e) => set("aiRepliesEnabled", e.target.checked)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
            <span className="text-sm text-gray-300">
              Send an AI-generated initial response when a ticket is opened
            </span>
          </label>

          {form.aiRepliesEnabled && (
            <label className="block">
              <span className="label">Custom System Prompt (optional)</span>
              <textarea
                className="input text-sm"
                rows={4}
                maxLength={1000}
                placeholder={`Leave blank to use the default prompt.\n\nExample: "You are a support agent for Acme Corp. Always ask for the user's order number first."`}
                value={form.aiRepliesPrompt}
                onChange={(e) => set("aiRepliesPrompt", e.target.value)}
                disabled={!isPremium}
                tabIndex={isPremium ? undefined : -1}
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.aiRepliesPrompt.length}/1000 characters
              </p>
            </label>
          )}
        </div>

        {/* ── Round-Robin Assignment (Premium) ─────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              <h2 className="font-semibold text-white">Round-Robin Assignment</h2>
            </div>
            {!isPremium && <span className="badge-base text-xs">⭐ Premium Only</span>}
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-discord-500"
              checked={form.roundRobinEnabled}
              onChange={(e) => set("roundRobinEnabled", e.target.checked)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
            <span className="text-sm text-gray-300">
              Automatically assign new tickets to staff members in rotation
            </span>
          </label>

          {form.roundRobinEnabled && (
            <label className="block">
              <span className="label">Support Role ID</span>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="input pl-9"
                  placeholder="Discord role ID — members of this role will receive tickets"
                  value={form.roundRobinRoleId}
                  onChange={(e) => set("roundRobinRoleId", e.target.value)}
                  disabled={!isPremium}
                  tabIndex={isPremium ? undefined : -1}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                The bot must have permission to view members of this role.
              </p>
            </label>
          )}
        </div>

        {/* ── White-label Bot (Premium) ─────────────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <h2 className="font-semibold text-white">White-label Bot</h2>
            </div>
            {!isPremium && <span className="badge-base text-xs">⭐ Premium Only</span>}
          </div>

          <label className="block">
            <span className="label">Custom Bot Name</span>
            <input
              className="input"
              placeholder="My Awesome Bot"
              value={form.customBotName}
              onChange={(e) => set("customBotName", e.target.value)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
          </label>

          <label className="block">
            <span className="label">Custom Bot Avatar URL</span>
            <input
              className="input"
              placeholder="https://example.com/avatar.png"
              value={form.customBotAvatar}
              onChange={(e) => set("customBotAvatar", e.target.value)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
          </label>

          <label className="block">
            <span className="label">Custom Bot Token</span>
            <input
              className="input font-mono text-sm"
              type="password"
              placeholder="Paste new token to update (leave blank to keep existing)"
              value={form.customBotToken}
              onChange={(e) => set("customBotToken", e.target.value)}
              autoComplete="off"
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
            <p className="text-xs text-gray-400 mt-1">
              ⚠️ Token is stored securely server-side. The name and avatar update
              immediately — full white-label token support requires a dedicated bot instance.
            </p>
          </label>
        </div>

        {/* ─── v1.6 Welcomer + Autorole (appy.bot parity) ─── */}
        <div className="cs-card space-y-4">
          <h2 className="cs-heading font-display font-bold text-white text-xl flex items-center gap-2">
            👋 Welcomer &amp; Autorole
          </h2>
          <p className="text-sm text-cs-muted">
            Greet new members and automatically assign them roles when they join.
          </p>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.welcomerEnabled}
              onChange={(e) => set("welcomerEnabled", e.target.checked)}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">Enable welcome message in a channel</span>
          </label>

          {form.welcomerEnabled && (
            <div className="pl-6 space-y-3">
              <label className="block">
                <span className="cs-label">Welcome Channel ID</span>
                <input className="cs-input font-mono text-xs" value={form.welcomerChannelId}
                  onChange={(e) => set("welcomerChannelId", e.target.value)}
                  placeholder="Discord channel ID" />
              </label>
              <label className="block">
                <span className="cs-label">Welcome Message (supports variables)</span>
                <textarea className="cs-textarea" rows={3} value={form.welcomerMessage}
                  onChange={(e) => set("welcomerMessage", e.target.value)}
                  placeholder="Welcome {user} to {server}! You are member #{server.members}." />
                <p className="text-xs text-cs-dim mt-1">
                  {"Variables: {user}, {user.name}, {server}, {server.members}, {date}, {time}"}
                </p>
              </label>
              <label className="block">
                <span className="cs-label">Embed Color</span>
                <input type="color" className="cs-input h-10" value={form.welcomerEmbedColor}
                  onChange={(e) => set("welcomerEmbedColor", e.target.value)} />
              </label>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.welcomerDmEnabled}
              onChange={(e) => set("welcomerDmEnabled", e.target.checked)}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">Also DM the new member</span>
          </label>

          {form.welcomerDmEnabled && (
            <label className="block pl-6">
              <span className="cs-label">Welcome DM</span>
              <textarea className="cs-textarea" rows={3} value={form.welcomerDmMessage}
                onChange={(e) => set("welcomerDmMessage", e.target.value)}
                placeholder="Welcome {user}! Check out #rules for server info." />
            </label>
          )}

          <div className="border-t border-cs-border pt-4">
            <label className="block">
              <span className="cs-label">Autorole — Role IDs for new users (comma-separated)</span>
              <input className="cs-input font-mono text-xs" value={form.autoroleIds}
                onChange={(e) => set("autoroleIds", e.target.value)}
                placeholder="Member, Unverified" />
              <p className="text-xs text-cs-dim mt-1">
                Automatically assigned to every new member who joins.
              </p>
            </label>
            <label className="block mt-3">
              <span className="cs-label">Autorole — Role IDs for new bots</span>
              <input className="cs-input font-mono text-xs" value={form.autoroleBotIds}
                onChange={(e) => set("autoroleBotIds", e.target.value)}
                placeholder="Bots" />
              <p className="text-xs text-cs-dim mt-1">
                Automatically assigned to bot accounts on join.
              </p>
            </label>
          </div>
        </div>

        {mutation.isError && (
          <p role="alert" className="text-red-400 text-sm">
            {mutation.error?.response?.data?.error || "Failed to save settings"}
          </p>
        )}

        {mutation.isSuccess && (
          <p role="status" className="text-green-400 text-sm">Settings saved successfully</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={mutation.isPending}
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
