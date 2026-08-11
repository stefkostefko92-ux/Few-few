// frontend/src/pages/AutomationPage.jsx
// Consolidated page with tabs: Polls, Giveaways, Sticky, Scheduled, Webhooks.
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect } from "../components/DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Gift, Pin, CalendarClock, Webhook, Trash2, Plus, CheckCircle2, RefreshCw,
  SmilePlus, Pencil, Send,
} from "lucide-react";
import {
  getPolls, createPoll, closePoll, deletePoll,
  getGiveaways, createGiveaway, endGiveaway, rerollGiveaway, deleteGiveaway,
  getStickies, upsertSticky, deleteSticky,
  getScheduled, createScheduled, deleteScheduled,
  getWebhooks, getWebhookEvents, createWebhook, updateWebhook, deleteWebhook,
  getReactionRoles, createReactionRole, updateReactionRole, deleteReactionRole, spawnReactionRole,
} from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge, PremiumLockCard } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import EmojiPicker from "../components/EmojiPicker";

const TABS = [
  { id: "polls",     tKey: "auto.tab.polls",         icon: BarChart3 },
  { id: "giveaways", tKey: "auto.tab.giveaways",      icon: Gift },
  { id: "reactionroles", tKey: "auto.tab.reactionRoles", icon: SmilePlus },
  { id: "sticky",    tKey: "auto.tab.sticky",         icon: Pin,           premium: true },
  { id: "scheduled", tKey: "auto.tab.scheduled",      icon: CalendarClock, premium: true },
  { id: "webhooks",  tKey: "auto.tab.webhooks",       icon: Webhook,       premium: true },
];

// Провалена мутация ТРЯБВА да каже нещо. Тази страница беше системното
// изключение от конвенцията на приложението: 14 от 18 мутации нямаха onError и
// изобщо не внасяха toast — натискаш „Изтрий", заявката пада, нищо не се случва
// и нищо не пише. (Дизайнера, 07.08.2026)
const mutErr = (err) => err?.response?.data?.error || null;

export default function AutomationPage() {
  const { t } = useT();
  const [tab, setTab] = useState("polls");
  const { isPremium } = usePremium();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="cs-heading font-display font-bold text-cs-text text-3xl">{t("auto.title")}</h1>
        <p className="text-cs-muted mt-2 max-w-2xl">{t("auto.subtitle")}</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-cs-border overflow-x-auto">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          const showBadge = tb.premium && !isPremium;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                active ? "border-cs-cyan text-cs-cyan" : "border-transparent text-cs-muted hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(tb.tKey)}
              {showBadge && <PremiumBadge small />}
            </button>
          );
        })}
      </div>

      {tab === "polls"     && <PollsTab />}
      {tab === "giveaways" && <GiveawaysTab />}
      {tab === "reactionroles" && <ReactionRolesTab />}
      {tab === "sticky"    && (isPremium ? <StickyTab /> : <PremiumLockCard feature={t("auto.sticky.title")} description={t("auto.sticky.desc")} />)}
      {tab === "scheduled" && (isPremium ? <ScheduledTab /> : <PremiumLockCard feature={t("auto.sched.title")} description={t("auto.sched.desc")} />)}
      {tab === "webhooks"  && (isPremium ? <WebhooksTab />  : <PremiumLockCard feature={t("auto.wh.title")} description={t("auto.wh.desc")} />)}
    </div>
  );
}

// ══════════════════════════════ POLLS ══════════════════════════════
const defaultPollForm = () => ({ channelId: "", question: "", optionsText: "", multiChoice: false, durationHours: "" });

function PollsTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultPollForm());
  const { data: polls = [], isLoading, isError } = useQuery({
    queryKey: ["polls", serverId],
    queryFn: () => getPolls(serverId),
  });
  const closeM  = useMutation({ mutationFn: (id) => closePoll(serverId, id),  onSuccess: () => qc.invalidateQueries({ queryKey: ["polls", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const deleteM = useMutation({ mutationFn: (id) => deletePoll(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["polls", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const createM = useMutation({
    mutationFn: (data) => createPoll(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["polls", serverId] }); setCreating(false); setForm(defaultPollForm()); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });

  const submitPoll = (e) => {
    e.preventDefault();
    const options = form.optionsText.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 9);
    createM.mutate({
      channelId: form.channelId.trim(),
      question: form.question.trim(),
      options,
      multiChoice: form.multiChoice,
      durationHours: form.durationHours ? Number(form.durationHours) : null,
    });
  };

  const newPollModal = (
    <Modal open={creating} onClose={() => setCreating(false)} title="New poll" maxWidth="max-w-lg">
      <form onSubmit={submitPoll} className="space-y-3">
        <label className="block">
          <span className="cs-label">{t("ui.channelReq")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId}
            onChange={(v) => setForm((f) => ({ ...f, channelId: v }))} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.questionReq")}</span>
          <input className="cs-input" required maxLength={256} value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            placeholder={t("ui.ph.pollQuestion")} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.optionsReq")}</span>
          <textarea className="cs-textarea" rows={4} required value={form.optionsText}
            onChange={(e) => setForm((f) => ({ ...f, optionsText: e.target.value }))}
            placeholder={"Minecraft\nValorant\nAmong Us"} />
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-cs-cyan" checked={form.multiChoice}
              onChange={(e) => setForm((f) => ({ ...f, multiChoice: e.target.checked }))} />
            <span className="text-sm text-cs-text">Multi-choice</span>
          </label>
          <label className="block flex-1">
            <span className="cs-label">{t("ui.autoCloseAfterH")}</span>
            <input type="number" min="1" max="720" className="cs-input" value={form.durationHours}
              onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))}
              placeholder={t("ui.ph.leaveEmptyManual")} />
          </label>
        </div>
        {createM.isError && (
          <p className="text-danger text-sm" role="alert">
            {typeof createM.error?.response?.data?.error === "string" ? createM.error.response.data.error : t("auto.polls.createFailed")}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setCreating(false)} className="cs-btn-ghost">Cancel</button>
          <button type="submit" className="cs-btn-primary" disabled={createM.isPending}>
            {createM.isPending ? "Posting…" : "Post poll"}
          </button>
        </div>
      </form>
    </Modal>
  );

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg={t("auto.polls.loadError")} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setForm(defaultPollForm()); setCreating(true); }} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Poll
        </button>
      </div>
      {!polls.length && <Empty icon={BarChart3} msg={t("auto.polls.empty")} />}
      {polls.map((p) => (
        <div key={p.id} className="cs-card flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-cs-text font-bold">{p.question}</span>
              {p.closedAt
                ? <span className="cs-badge text-cs-dim">Closed</span>
                : <span className="cs-badge text-success">Active</span>}
              {p.multiChoice && <span className="cs-badge text-cs-cyan">Multi-choice</span>}
            </div>
            <p className="text-xs text-cs-muted mt-1">
              {p.options.length} options · {p.totalVotes} vote{p.totalVotes === 1 ? "" : "s"} · Created {new Date(p.createdAt).toLocaleDateString()}
              {p.closesAt && ` · Closes ${new Date(p.closesAt).toLocaleString()}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!p.closedAt && (
              <button onClick={() => closeM.mutate(p.id)} className="cs-btn-secondary text-xs">Close</button>
            )}
            <button
              onClick={() => setConfirmState({ title: t("auto.polls.delete"), message: t("auto.polls.deleteConfirm"), onConfirm: () => deleteM.mutate(p.id) })}
              aria-label={t("auto.polls.delete")}
              title="Delete poll"
              className="text-danger hover:text-red-300 p-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={t("common.delete")}
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      {newPollModal}
    </div>
  );
}

// ══════════════════════════════ GIVEAWAYS ══════════════════════════════
const defaultGiveawayForm = () => ({
  channelId: "", prize: "", description: "", winnerCount: 1, durationMinutes: 60, requiredRoleIds: "",
});

function GiveawaysTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultGiveawayForm());
  const { data: giveaways = [], isLoading, isError } = useQuery({
    queryKey: ["giveaways", serverId],
    queryFn: () => getGiveaways(serverId),
  });
  const endM    = useMutation({ mutationFn: (id) => endGiveaway(serverId, id),    onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const rerollM = useMutation({ mutationFn: (id) => rerollGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const deleteM = useMutation({ mutationFn: (id) => deleteGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const createM = useMutation({
    mutationFn: (data) => createGiveaway(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["giveaways", serverId] }); setCreating(false); setForm(defaultGiveawayForm()); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });

  const submitGiveaway = (e) => {
    e.preventDefault();
    createM.mutate({
      channelId: form.channelId.trim(),
      prize: form.prize.trim(),
      description: form.description.trim() || null,
      winnerCount: Number(form.winnerCount) || 1,
      durationMinutes: Number(form.durationMinutes) || 60,
      requiredRoleIds: form.requiredRoleIds.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  const newGiveawayModal = (
    <Modal open={creating} onClose={() => setCreating(false)} title="New giveaway" maxWidth="max-w-lg">
      <form onSubmit={submitGiveaway} className="space-y-3">
        <label className="block">
          <span className="cs-label">{t("ui.channelReq")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId}
            onChange={(v) => setForm((f) => ({ ...f, channelId: v }))} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.prizeReq")}</span>
          <input className="cs-input" required maxLength={256} value={form.prize}
            onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))}
            placeholder={t("ui.ph.prize")} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.description")}</span>
          <textarea className="cs-textarea" rows={2} maxLength={1000} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("ui.ph.giveawayDetails")} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.winners")}</span>
            <input type="number" min="1" max="20" className="cs-input" value={form.winnerCount}
              onChange={(e) => setForm((f) => ({ ...f, winnerCount: e.target.value }))} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.durationMinReq")}</span>
            <input type="number" min="1" max="43200" required className="cs-input" value={form.durationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.requiredRolesOpt")}</span>
          <DiscordRoleSelect multi value={form.requiredRoleIds} onChange={(v) => setForm((f) => ({ ...f, requiredRoleIds: v }))} requireAssignable={false} />
        </label>
        {createM.isError && (
          <p className="text-danger text-sm" role="alert">
            {typeof createM.error?.response?.data?.error === "string" ? createM.error.response.data.error : t("auto.give.createFailed")}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setCreating(false)} className="cs-btn-ghost">Cancel</button>
          <button type="submit" className="cs-btn-primary" disabled={createM.isPending}>
            {createM.isPending ? "Posting…" : "Start giveaway"}
          </button>
        </div>
      </form>
    </Modal>
  );

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg={t("auto.give.loadError")} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setForm(defaultGiveawayForm()); setCreating(true); }} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Giveaway
        </button>
      </div>
      {!giveaways.length && <Empty icon={Gift} msg={t("auto.give.empty")} />}
      {giveaways.map((g) => (
        <div key={g.id} className="cs-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-cs-text font-bold">🎉 {g.prize}</span>
                {g.endedAt
                  ? <span className="cs-badge text-cs-dim">Ended</span>
                  : <span className="cs-badge text-cs-gold">Active</span>}
              </div>
              <p className="text-xs text-cs-muted mt-1">
                {g.winnerCount} winner{g.winnerCount > 1 ? "s" : ""} · {g.entryCount} entr{g.entryCount === 1 ? "y" : "ies"} ·
                {g.endedAt ? ` Ended ${new Date(g.endedAt).toLocaleString()}` : ` Ends ${new Date(g.endsAt).toLocaleString()}`}
              </p>
              {g.endedAt && g.winnerIds?.length > 0 && (
                <p className="text-xs text-success mt-1">
                  🏆 Winners: {g.winnerIds.map((id) => `<@${id}>`).join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!g.endedAt && (
                <button
                  onClick={() => setConfirmState({ title: t("auto.give.end"), message: t("auto.give.endConfirm"), confirmLabel: "End Now", destructive: false, onConfirm: () => endM.mutate(g.id) })}
                  className="cs-btn-secondary text-xs"
                >
                  End Now
                </button>
              )}
              {g.endedAt && (
                <button onClick={() => rerollM.mutate(g.id)} className="cs-btn-secondary text-xs flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Reroll
                </button>
              )}
              <button
                onClick={() => setConfirmState({ title: t("auto.give.delete"), message: t("auto.give.deleteConfirm"), destructive: true, onConfirm: () => deleteM.mutate(g.id) })}
                aria-label={t("auto.give.delete")}
                title="Delete giveaway"
                className="text-danger hover:text-red-300 p-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || "Delete"}
        destructive={confirmState?.destructive ?? true}
        loading={endM.isPending || deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      {newGiveawayModal}
    </div>
  );
}

// ══════════════════════════════ STICKY ══════════════════════════════
function StickyTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", embedTitle: "", embedColor: "#8fe600" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: stickies = [], isLoading, isError } = useQuery({
    queryKey: ["stickies", serverId],
    queryFn: () => getStickies(serverId),
  });
  const saveM   = useMutation({ mutationFn: (data) => upsertSticky(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stickies", serverId] }); setForm({ channelId: "", content: "", embedTitle: "", embedColor: "#8fe600" }); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });
  const deleteM = useMutation({ mutationFn: (chId) => deleteSticky(serverId, chId), onSuccess: () => qc.invalidateQueries({ queryKey: ["stickies", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); saveM.mutate(form); }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">Set Sticky Message</h3>
        <label className="block">
          <span className="cs-label">{t("ui.channel")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => setForm({ ...form, channelId: v })} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.titleOpt")}</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.color")}</span>
            <input type="color" className="cs-input h-10" value={form.embedColor} onChange={(e) => setForm({ ...form, embedColor: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.content")}</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={saveM.isPending}>
          <Plus className="w-4 h-4" /> Save Sticky
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg={t("auto.sticky.loadError")} />}
      {!isLoading && !isError && !stickies.length && <Empty icon={Pin} msg="No sticky messages yet — create one above." />}

      <div className="space-y-3">
        {stickies.map((s) => (
          <div key={s.id} className="cs-card flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-cs-dim font-mono">Channel: {s.channelId}</p>
              {s.embedTitle && <p className="text-cs-text font-bold mt-1">{s.embedTitle}</p>}
              <p className="text-sm text-cs-text mt-1 line-clamp-2">{s.content}</p>
            </div>
            <button
              onClick={() => setConfirmState({ title: t("auto.sticky.delete"), message: t("auto.sticky.deleteConfirm"), onConfirm: () => deleteM.mutate(s.channelId) })}
              aria-label={t("auto.sticky.delete")}
              title="Delete sticky message"
              className="text-danger p-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel="Delete"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ══════════════════════════════ SCHEDULED ══════════════════════════════
function ScheduledTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: scheduled = [], isLoading, isError } = useQuery({
    queryKey: ["scheduled", serverId],
    queryFn: () => getScheduled(serverId),
  });
  const createM = useMutation({ mutationFn: (data) => createScheduled(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scheduled", serverId] }); setForm({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" }); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });
  const deleteM = useMutation({ mutationFn: (id) => deleteScheduled(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => {
        e.preventDefault();
        createM.mutate({ ...form, recurrence: form.recurrence || null, sendAt: new Date(form.sendAt).toISOString() });
      }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">Schedule New Message</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.channel")}</span>
            <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => setForm({ ...form, channelId: v })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.sendAtLocal")}</span>
            <input required type="datetime-local" className="cs-input" value={form.sendAt} onChange={(e) => setForm({ ...form, sendAt: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.embedTitleOpt")}</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.recurrence")}</span>
            <select className="cs-select" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              <option value="">One-shot</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.content")}</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={createM.isPending}>
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg={t("auto.sched.loadError")} />}
      {!isLoading && !isError && !scheduled.length && <Empty icon={CalendarClock} msg={t("auto.sched.empty")} />}

      <div className="space-y-3">
        {scheduled.map((m) => (
          <div key={m.id} className="cs-card flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-cs-dim">#{m.channelId.slice(-6)}</span>
                {m.sentAt
                  ? <span className="cs-badge text-cs-dim">Sent</span>
                  : <span className="cs-badge text-success">Pending</span>}
                {m.recurrence && <span className="cs-badge text-cs-cyan">{m.recurrence}</span>}
              </div>
              {m.embedTitle && <p className="text-cs-text font-bold mt-1">{m.embedTitle}</p>}
              <p className="text-sm text-cs-text mt-1 line-clamp-2">{m.content}</p>
              <p className="text-xs text-cs-muted mt-1">{new Date(m.sendAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => setConfirmState({ title: t("auto.sched.delete"), message: t("auto.sched.deleteConfirm"), onConfirm: () => deleteM.mutate(m.id) })}
              aria-label={t("auto.sched.delete")}
              title="Delete scheduled message"
              className="text-danger p-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel="Delete"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ══════════════════════════════ WEBHOOKS ══════════════════════════════
function WebhooksTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [], enabled: true });
  const [confirmState, setConfirmState] = useState(null);
  const [formError, setFormError] = useState(null);
  const { data: hooks = [], isLoading, isError } = useQuery({ queryKey: ["webhooks", serverId], queryFn: () => getWebhooks(serverId) });
  const { data: events = {} } = useQuery({ queryKey: ["webhook-events"], queryFn: getWebhookEvents });

  const createM = useMutation({ mutationFn: (data) => createWebhook(serverId, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); }, onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const updateM = useMutation({ mutationFn: ({ id, data }) => updateWebhook(serverId, id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); }, onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const deleteM = useMutation({ mutationFn: (id) => deleteWebhook(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });

  const openNew = () => { setForm({ name: "", url: "", secret: "", events: [], enabled: true }); setFormError(null); setEditing("new"); };
  const openEdit = (h) => { setForm({ name: h.name, url: h.url, secret: h.secret || "", events: h.events, enabled: h.enabled }); setFormError(null); setEditing(h.id); };

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.events.length) {
      setFormError(t("auto.wh.needEvent"));
      return;
    }
    if (editing === "new") createM.mutate(form);
    else updateM.mutate({ id: editing, data: form });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-cs-muted max-w-2xl">
          Webhooks POST a JSON payload to your URL whenever subscribed events fire.
          Payloads are HMAC-signed with <code className="text-cs-cyan">X-Supreme Bot-Signature: sha256=...</code> if a secret is set.
        </p>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {isLoading && <div className="cs-card h-32 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg={t("auto.wh.loadError")} />}
      {!isLoading && !isError && !hooks.length && <Empty icon={Webhook} msg="No webhooks configured yet — create one above." />}

      <div className="space-y-3">
        {hooks.map((h) => (
          <div key={h.id} className="cs-card flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-cs-text font-bold">{h.name}</span>
                {h.enabled
                  ? <span className="cs-badge text-success">Enabled</span>
                  : <span className="cs-badge text-cs-dim">Disabled</span>}
                {h.failCount > 0 && <span className="cs-badge text-warning">{h.failCount} fails</span>}
              </div>
              <p className="text-xs font-mono text-cs-dim mt-1 truncate">{h.url}</p>
              <p className="text-xs text-cs-muted mt-1">
                Events: {h.events.join(", ")}
                {h.lastDeliveryAt && ` · Last: ${new Date(h.lastDeliveryAt).toLocaleString()} (${h.lastStatus})`}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button onClick={() => openEdit(h)} className="cs-btn-secondary text-xs">Edit</button>
              <button
                onClick={() => setConfirmState({ title: t("auto.wh.delete"), message: `Delete "${h.name}"? This cannot be undone.`, onConfirm: () => deleteM.mutate(h.id) })}
                aria-label={`Delete webhook ${h.name}`}
                title="Delete webhook"
                className="text-danger p-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New Webhook" : "Edit Webhook"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="cs-label">{t("ui.name")}</span>
            <input required className="cs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <label className="block">
            <span className="cs-label">{t("ui.url")}</span>
            <input required type="url" className="cs-input font-mono text-xs" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-service.example.com/webhooks/supreme" />
          </label>

          <label className="block">
            <span className="cs-label">{t("ui.hmacSecretOpt")}</span>
            <input type="password" className="cs-input font-mono text-xs" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={t("ui.ph.signPayloads")} />
          </label>

          <fieldset>
            <legend className="cs-label">{t("ui.events")}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {(events.events || []).map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm text-cs-text">
                  <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} className="accent-cs-cyan" />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">Enabled</span>
          </label>

          {formError && (
            <p role="alert" className="text-danger text-sm">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="cs-btn-secondary">Cancel</button>
            <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={createM.isPending || updateM.isPending}>
              <CheckCircle2 className="w-4 h-4" /> Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel="Delete"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ══════════════════════════════ REACTION ROLES (v33) ══════════════════════════════
const defaultRrmPair = () => ({ emoji: "", roleId: "", label: "" });
const defaultRrmForm = () => ({
  title: "",
  description: "",
  color: "#5865F2",
  exclusive: false,
  pairs: [defaultRrmPair()],
});

function ReactionRolesTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | "new" | rrmId
  const [form, setForm] = useState(defaultRrmForm());
  const [spawnInputs, setSpawnInputs] = useState({}); // rrmId → channelId
  const [confirmState, setConfirmState] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { data: messages = [], isLoading, isError } = useQuery({
    queryKey: ["reactionroles", serverId],
    queryFn: () => getReactionRoles(serverId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reactionroles", serverId] });
  const errMsg = (err, fallback) => err?.response?.data?.error?.formErrors?.join?.(", ")
    || (typeof err?.response?.data?.error === "string" ? err.response.data.error : null)
    || fallback;

  const createM = useMutation({
    mutationFn: (data) => createReactionRole(serverId, data),
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (err) => setActionError(errMsg(err, t("auto.rr.createFailed"))),
  });
  const updateM = useMutation({
    mutationFn: ({ id, data }) => updateReactionRole(serverId, id, data),
    onSuccess: (data) => {
      invalidate(); setEditing(null);
      // botWarning = записът мина, но живото Discord съобщение НЕ се обнови.
      if (data?.botWarning) setActionError(data.botWarning);
    },
    onError: (err) => setActionError(errMsg(err, t("auto.rr.updateFailed"))),
  });
  const deleteM = useMutation({
    mutationFn: (id) => deleteReactionRole(serverId, id),
    onSuccess: invalidate,
    onError: (err) => setActionError(errMsg(err, t("auto.rr.deleteFailed"))),
  });
  const spawnM = useMutation({
    mutationFn: ({ id, channelId }) => spawnReactionRole(serverId, id, channelId),
    onSuccess: (_d, { id }) => { setSpawnInputs((s) => ({ ...s, [id]: "" })); invalidate(); },
    onError: (err) => setActionError(errMsg(err, t("auto.rr.postFailed"))),
  });

  const openEdit = (m) => {
    setForm({
      title: m.title,
      description: m.description || "",
      color: m.color || "#5865F2",
      exclusive: m.exclusive,
      pairs: m.pairs.map((p) => ({ emoji: p.emoji, roleId: p.roleId, label: p.label || "" })),
    });
    setEditing(m.id);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setActionError(null);
    const payload = {
      ...form,
      description: form.description || null,
      pairs: form.pairs
        .filter((p) => p.emoji.trim() && p.roleId.trim())
        .map((p) => ({ emoji: p.emoji.trim(), roleId: p.roleId.trim(), label: p.label.trim() || null })),
    };
    if (!payload.pairs.length) { setActionError(t("auto.rr.needPair")); return; }
    if (editing === "new") createM.mutate(payload);
    else updateM.mutate({ id: editing, data: payload });
  };

  const updatePair = (i, key, val) =>
    setForm((f) => ({ ...f, pairs: f.pairs.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)) }));

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg={t("auto.rr.loadError")} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cs-muted max-w-xl">
          Members react to a message to get a role — remove the reaction to remove it.
          Exclusive mode allows one role per message (self-service pick-one).
        </p>
        <button
          onClick={() => { setForm(defaultRrmForm()); setEditing("new"); setActionError(null); }}
          className="cs-btn-primary flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> New Message
        </button>
      </div>

      {!messages.length ? (
        <Empty icon={SmilePlus} msg={t("auto.rr.empty")} />
      ) : (
        messages.map((m) => (
          <div key={m.id} className="cs-card">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: m.color }} />
                  <h3 className="font-semibold text-cs-text truncate">{m.title}</h3>
                  {m.exclusive && <span className="cs-badge text-cs-cyan">Exclusive</span>}
                  {m.messageId
                    ? <span className="cs-badge text-success">Live</span>
                    : <span className="cs-badge text-cs-dim">Not posted</span>}
                </div>
                <p className="text-xs text-cs-muted mt-1">
                  {m.pairs.length} role{m.pairs.length === 1 ? "" : "s"}
                  {m.channelId && <> · channel <code className="text-xs">{m.channelId}</code></>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.pairs.map((p) => (
                    <span key={p.id} className="bg-cs-bg text-cs-text text-xs px-2 py-0.5 rounded">
                      {p.emoji.includes(":") ? `:${p.emoji.split(":")[0]}:` : p.emoji} → {p.label || p.roleId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-[11rem] sm:flex-none sm:w-44">
                    <DiscordChannelSelect
                      kind="text"
                      value={spawnInputs[m.id] || ""}
                      onChange={(v) => setSpawnInputs((s) => ({ ...s, [m.id]: v }))}
                    />
                  </div>
                  <button
                    className="cs-btn-primary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                    disabled={!spawnInputs[m.id] || spawnM.isPending}
                    onClick={() => spawnM.mutate({ id: m.id, channelId: spawnInputs[m.id].trim() })}
                  >
                    <Send className="w-3 h-3" /> {m.messageId ? "Re-post" : "Post to channel"}
                  </button>
                </div>
                <button
                  aria-label={t("auto.rr.edit")}
                  title="Edit"
                  className="text-cs-muted hover:text-white transition-colors p-1"
                  onClick={() => openEdit(m)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  aria-label={t("auto.rr.delete")}
                  title="Delete"
                  className="text-danger hover:text-red-300 transition-colors p-1"
                  onClick={() => setConfirmState({
                    title: t("auto.rr.delete"),
                    message: `Delete "${m.title}"? The Discord message will be removed too.`,
                    onConfirm: () => { deleteM.mutate(m.id); setConfirmState(null); },
                  })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Create / Edit modal */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New reaction role message" : "Edit reaction role message"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block col-span-2">
              <span className="cs-label">{t("ui.titleReq")}</span>
              <input className="cs-input" required value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t("ui.ph.pickYourRoles")} />
            </label>
            <label className="block">
              <span className="cs-label">{t("ui.color")}</span>
              <input type="color" className="cs-input h-10 p-1" value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            </label>
          </div>
          <label className="block">
            <span className="cs-label">{t("ui.description")}</span>
            <textarea className="cs-textarea" rows={2} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("ui.ph.reactForRole")} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-cs-cyan" checked={form.exclusive}
              onChange={(e) => setForm((f) => ({ ...f, exclusive: e.target.checked }))} />
            <span className="text-sm text-cs-text">Exclusive — one role per member (new reaction replaces the old one)</span>
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-cs-text">Emoji → Role pairs ({form.pairs.length}/20)</h3>
              <button type="button" disabled={form.pairs.length >= 20}
                onClick={() => setForm((f) => ({ ...f, pairs: [...f.pairs, defaultRrmPair()] }))}
                className="text-cs-cyan text-sm flex items-center gap-1 disabled:opacity-40">
                <Plus className="w-3 h-3" /> Add pair
              </button>
            </div>
            <div className="space-y-2">
              {form.pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-[70px_34px_1fr_1fr_28px] gap-2 items-center">
                  <input className="cs-input text-center" placeholder="🎮" aria-label={`Emoji for pair ${i + 1}`}
                    value={p.emoji} onChange={(e) => updatePair(i, "emoji", e.target.value)} />
                  <EmojiPicker buttonLabel={t("emoji.pickForPair", { n: i + 1 })} onSelect={(e) => updatePair(i, "emoji", e)} />
                  <DiscordRoleSelect value={p.roleId} onChange={(v) => updatePair(i, "roleId", v)} />
                  <input className="cs-input text-xs" placeholder={t("ui.labelOpt")} aria-label={`Label for pair ${i + 1}`}
                    value={p.label} onChange={(e) => updatePair(i, "label", e.target.value)} />
                  <button type="button" aria-label={`Remove pair ${i + 1}`}
                    disabled={form.pairs.length <= 1}
                    onClick={() => setForm((f) => ({ ...f, pairs: f.pairs.filter((_, idx) => idx !== i) }))}
                    className="text-danger hover:text-red-300 disabled:opacity-30 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-cs-dim mt-2">{t("ui.hint.emojiCustom")}<code>name:id</code>.
              Role ID: right-click the role in Discord → Copy Role ID (the bot's role must be above it).
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="cs-btn-ghost">Cancel</button>
            <button type="submit" className="cs-btn-primary" disabled={createM.isPending || updateM.isPending}>
              {(createM.isPending || updateM.isPending) ? "Saving…" : editing === "new" ? "Create" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      {actionError && (
        <div role="alert" className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500/30 text-danger text-sm px-4 py-3 rounded-lg z-50 flex items-center gap-3">
          <span>❌ {actionError}</span>
          <button type="button" aria-label={t("auto.dismissError")} onClick={() => setActionError(null)} className="text-red-300 hover:text-red-200">✕</button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        destructive
        confirmLabel="Delete"
        loading={deleteM.isPending}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function Empty({ msg, icon }) {
  return <EmptyState icon={icon} title={msg} className="!py-10" />;
}

function ErrorCard({ msg }) {
  return (
    <div role="alert" className="cs-card text-center py-10 text-danger">{msg}</div>
  );
}
