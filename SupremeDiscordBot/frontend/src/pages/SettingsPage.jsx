// frontend/src/pages/SettingsPage.jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Hash, Bot, Zap, RefreshCw, Star, Activity, Globe } from "lucide-react";
import { getServer, updateServer } from "../api";
import { useToast } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";
import { LANGUAGE_OPTIONS } from "../i18n/dashboard";

export default function SettingsPage() {
  const { serverId } = useParams();
  const { t } = useT();
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
        welcomerEmbedColor: server.welcomerEmbedColor || "#8fe600",
        welcomerDmEnabled:  server.welcomerDmEnabled || false,
        welcomerDmMessage:  server.welcomerDmMessage || "",
        autoroleIds:        (server.autoroleIds || []).join(","),
        autoroleBotIds:     (server.autoroleBotIds || []).join(","),
        // Server event logging
        eventLogEnabled:       server.eventLogEnabled || false,
        eventLogChannelId:     server.eventLogChannelId || "",
        eventLogCat_voice:      (server.eventLogCategories || []).includes("voice"),
        eventLogCat_members:    (server.eventLogCategories || []).includes("members"),
        eventLogCat_moderation: (server.eventLogCategories || []).includes("moderation"),
        eventLogCat_messages:   (server.eventLogCategories || []).includes("messages"),
        eventLogCat_server:     (server.eventLogCategories || []).includes("server"),
        // v37 — по избор СВОЙ канал за всяка категория (празно = общият канал).
        eventLogCh_voice:       server.eventLogChannels?.voice || "",
        eventLogCh_members:     server.eventLogChannels?.members || "",
        eventLogCh_moderation:  server.eventLogChannels?.moderation || "",
        eventLogCh_messages:    server.eventLogChannels?.messages || "",
        eventLogCh_server:      server.eventLogChannels?.server || "",
        // Език на бота за сървъра (fallback за членове с неподдържан Discord език)
        language:               server.language || "en",
      });
    }
  }, [server]);

  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (data) => updateServer(serverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", serverId] });
      // Виж бележката в TrialBanner: сайдбарът и списъкът със сървъри четат
      // ДРУГ ключ и остават стари без това.
      qc.invalidateQueries({ queryKey: ["servers"] });
      setForm((f) => f ? { ...f, customBotToken: "" } : f);
      toast.success(t("settings.saved"));
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("settings.saveFailed")),
  });

  if (isLoading || !form) {
    return (
      <div className="p-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="cs-card h-16 animate-pulse bg-cs-panel" />
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
      // Server event logging (all tiers)
      eventLogEnabled:    form.eventLogEnabled,
      eventLogChannelId:  form.eventLogChannelId || null,
      eventLogCategories: [
        form.eventLogCat_voice && "voice",
        form.eventLogCat_members && "members",
        form.eventLogCat_moderation && "moderation",
        form.eventLogCat_messages && "messages",
        form.eventLogCat_server && "server",
      ].filter(Boolean),
      // Пращаме канал само за ВКЛЮЧЕНИ категории с попълнена стойност —
      // иначе изключена категория би оставила висящ канал в базата.
      eventLogChannels: Object.fromEntries(
        [["voice", form.eventLogCat_voice], ["members", form.eventLogCat_members],
         ["moderation", form.eventLogCat_moderation], ["messages", form.eventLogCat_messages],
         ["server", form.eventLogCat_server]]
          .filter(([cat, on]) => on && (form[`eventLogCh_${cat}`] || "").trim())
          .map(([cat]) => [cat, form[`eventLogCh_${cat}`].trim()])
      ),
      language: form.language,
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
        <h1 className="text-2xl font-bold text-cs-text">Server Settings</h1>
        <p className="text-cs-muted text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── General ─────────────────────────────────────────────────── */}
        <div className="cs-card space-y-4">
          <h2 className="font-semibold text-cs-text">{t("settings.general")}</h2>

          <label className="block">
            <span className="cs-label">{t("settings.logChannel")}</span>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-muted" />
              <input
                className="cs-input pl-9"
                placeholder="Discord channel ID for bot activity logs"
                value={form.logChannelId}
                onChange={(e) => set("logChannelId", e.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="cs-label">{t("settings.archiveChannel")}</span>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-muted" />
              <input
                className="cs-input pl-9"
                placeholder="Channel where ticket transcripts are posted on close"
                value={form.archiveChannelId}
                onChange={(e) => set("archiveChannelId", e.target.value)}
              />
            </div>
          </label>
        </div>

        {/* ── Език на бота за сървъра ─────────────────────────────────── */}
        <div className="cs-card space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cs-cyan" />
            <h2 className="font-semibold text-cs-text">{t("language.botForServer")}</h2>
          </div>
          <p className="text-sm text-cs-muted">{t("language.botForServer.hint")}</p>
          <label className="block max-w-xs">
            <span className="cs-label">{t("language.label")}</span>
            <select
              className="cs-input"
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Server Event Logging ──────────────────────────────────── */}
        <div className="cs-card space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cs-cyan" />
            <h2 className="font-semibold text-cs-text">Server Activity Logging</h2>
          </div>
          <p className="text-sm text-cs-muted">
            Log member actions in this server (voice mute/deaf/join, role &amp; nickname changes,
            timeouts, bans/kicks) to a Discord channel. Events are posted only to the channel you
            choose — they are not stored by us or shown in the dashboard. You are the data
            controller for this activity — enable it only with a lawful basis and tell your members.
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-cs-cyan"
              checked={form.eventLogEnabled}
              onChange={(e) => set("eventLogEnabled", e.target.checked)}
            />
            <span className="text-sm text-cs-text">{t("settings.enableLogging")}</span>
          </label>

          {form.eventLogEnabled && (
            <div className="pl-6 space-y-3">
              <label className="block">
                <span className="cs-label">Log Channel ID</span>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-muted" />
                  <input
                    className="cs-input pl-9 font-mono text-xs"
                    placeholder="Discord channel ID where events are posted"
                    value={form.eventLogChannelId}
                    onChange={(e) => set("eventLogChannelId", e.target.value)}
                  />
                </div>
              </label>
              <div>
                <span className="cs-label">{t("settings.categoriesToLog")}</span>
                <p className="text-xs text-cs-dim mt-1 mb-2">{t("settings.perCategoryHint")}</p>
                <div className="flex flex-col gap-2 mt-1">
                  {[
                    ["eventLogCat_voice", t("settings.cat.voice"), "voice"],
                    ["eventLogCat_members", t("settings.cat.members"), "members"],
                    ["eventLogCat_moderation", t("settings.cat.moderation"), "moderation"],
                    ["eventLogCat_messages", t("settings.cat.messages"), "messages"],
                    ["eventLogCat_server", t("settings.cat.server"), "server"],
                  ].map(([key, label, cat]) => (
                    <div key={key} className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-cs-text flex-1 min-w-[220px]">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-cs-cyan"
                          checked={form[key]}
                          onChange={(e) => set(key, e.target.checked)}
                        />
                        {label}
                      </label>
                      {/* Собствен канал за категорията. Празно = ползвай общия
                          по-горе, затова placeholder-ът го казва изрично. */}
                      <input
                        className="cs-input w-56 py-1 text-sm font-mono disabled:opacity-40"
                        value={form[`eventLogCh_${cat}`] || ""}
                        onChange={(e) => set(`eventLogCh_${cat}`, e.target.value)}
                        disabled={!form[key]}
                        aria-label={t("settings.channelForCategory", { category: label })}
                        placeholder={t("settings.useMainChannel")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── AI Auto-Replies (Premium) ─────────────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`cs-card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-cs-gold" />
              <h2 className="font-semibold text-cs-text">AI Auto-Replies</h2>
            </div>
            {!isPremium && <span className="cs-badge-muted text-xs"><Star className="w-3 h-3 text-premium" aria-hidden="true" /> Premium Only</span>}
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
            <span className="text-sm text-cs-text">
              Send an AI-generated initial response when a ticket is opened
            </span>
          </label>

          {form.aiRepliesEnabled && (
            <label className="block">
              <span className="cs-label">Custom System Prompt (optional)</span>
              <textarea
                className="cs-input text-sm"
                rows={4}
                maxLength={1000}
                placeholder={`Leave blank to use the default prompt.\n\nExample: "You are a support agent for Acme Corp. Always ask for the user's order number first."`}
                value={form.aiRepliesPrompt}
                onChange={(e) => set("aiRepliesPrompt", e.target.value)}
                disabled={!isPremium}
                tabIndex={isPremium ? undefined : -1}
              />
              <p className="text-xs text-cs-muted mt-1">
                {form.aiRepliesPrompt.length}/1000 characters
              </p>
            </label>
          )}
        </div>

        {/* ── Round-Robin Assignment (Premium) ─────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`cs-card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              <h2 className="font-semibold text-cs-text">Round-Robin Assignment</h2>
            </div>
            {!isPremium && <span className="cs-badge-muted text-xs"><Star className="w-3 h-3 text-premium" aria-hidden="true" /> Premium Only</span>}
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
            <span className="text-sm text-cs-text">
              Automatically assign new tickets to staff members in rotation
            </span>
          </label>

          {form.roundRobinEnabled && (
            <label className="block">
              <span className="cs-label">Support Role ID</span>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-muted" />
                <input
                  className="cs-input pl-9"
                  placeholder="Discord role ID — members of this role will receive tickets"
                  value={form.roundRobinRoleId}
                  onChange={(e) => set("roundRobinRoleId", e.target.value)}
                  disabled={!isPremium}
                  tabIndex={isPremium ? undefined : -1}
                />
              </div>
              <p className="text-xs text-cs-muted mt-1">
                The bot must have permission to view members of this role.
              </p>
            </label>
          )}
        </div>

        {/* ── White-label Bot (Premium) ─────────────────────────────── */}
        <div
          aria-disabled={!isPremium}
          className={`cs-card space-y-4 ${!isPremium ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              <h2 className="font-semibold text-cs-text">White-label Bot</h2>
            </div>
            {!isPremium && <span className="cs-badge-muted text-xs"><Star className="w-3 h-3 text-premium" aria-hidden="true" /> Premium Only</span>}
          </div>

          <label className="block">
            <span className="cs-label">{t("settings.customBotName")}</span>
            <input
              className="cs-input"
              placeholder="My Awesome Bot"
              value={form.customBotName}
              onChange={(e) => set("customBotName", e.target.value)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
          </label>

          <label className="block">
            <span className="cs-label">{t("settings.customBotAvatar")}</span>
            <input
              className="cs-input"
              placeholder="https://example.com/avatar.png"
              value={form.customBotAvatar}
              onChange={(e) => set("customBotAvatar", e.target.value)}
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
          </label>

          <label className="block">
            <span className="cs-label">{t("settings.customBotToken")}</span>
            <input
              className="cs-input font-mono text-sm"
              type="password"
              placeholder="Paste new token to update (leave blank to keep existing)"
              value={form.customBotToken}
              onChange={(e) => set("customBotToken", e.target.value)}
              autoComplete="off"
              disabled={!isPremium}
              tabIndex={isPremium ? undefined : -1}
            />
            <p className="text-xs text-cs-muted mt-1">
              ⚠️ Token is stored securely server-side. The name and avatar update
              immediately — full white-label token support requires a dedicated bot instance.
            </p>
          </label>
        </div>

        {/* ─── v1.6 Welcomer + Autorole (appy.bot parity) ─── */}
        <div className="cs-card space-y-4">
          <h2 className="cs-heading font-display font-bold text-cs-text text-xl flex items-center gap-2">
            👋 Welcomer &amp; Autorole
          </h2>
          <p className="text-sm text-cs-muted">
            Greet new members and automatically assign them roles when they join.
          </p>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.welcomerEnabled}
              onChange={(e) => set("welcomerEnabled", e.target.checked)}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">{t("settings.enableWelcome")}</span>
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
                <span className="cs-label">{t("settings.embedColor")}</span>
                <input type="color" className="cs-input h-10" value={form.welcomerEmbedColor}
                  onChange={(e) => set("welcomerEmbedColor", e.target.value)} />
              </label>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.welcomerDmEnabled}
              onChange={(e) => set("welcomerDmEnabled", e.target.checked)}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">{t("settings.alsoDm")}</span>
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
          <p role="alert" className="text-danger text-sm">
            {mutation.error?.response?.data?.error || t("settings.saveFailed")}
          </p>
        )}

        {mutation.isSuccess && (
          <p role="status" className="text-success text-sm">Settings saved successfully</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="cs-btn-primary flex items-center gap-2"
            disabled={mutation.isPending}
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? t("common.saving") : t("settings.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
