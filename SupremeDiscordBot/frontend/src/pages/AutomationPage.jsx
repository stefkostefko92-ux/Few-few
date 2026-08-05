// frontend/src/pages/AutomationPage.jsx
// Consolidated page with tabs: Polls, Giveaways, Sticky, Scheduled, Webhooks.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Gift, Pin, CalendarClock, Webhook, Trash2, Plus, CheckCircle2, RefreshCw,
} from "lucide-react";
import {
  getPolls, closePoll, deletePoll,
  getGiveaways, endGiveaway, rerollGiveaway, deleteGiveaway,
  getStickies, upsertSticky, deleteSticky,
  getScheduled, createScheduled, deleteScheduled,
  getWebhooks, getWebhookEvents, createWebhook, updateWebhook, deleteWebhook,
} from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge, PremiumLockCard } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

const TABS = [
  { id: "polls",     label: "Polls",      icon: BarChart3 },
  { id: "giveaways", label: "Giveaways",  icon: Gift },
  { id: "sticky",    label: "Sticky",     icon: Pin,           premium: true },
  { id: "scheduled", label: "Scheduled",  icon: CalendarClock, premium: true },
  { id: "webhooks",  label: "Webhooks",   icon: Webhook,       premium: true },
];

export default function AutomationPage() {
  const [tab, setTab] = useState("polls");
  const { isPremium } = usePremium();

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="cs-heading font-display font-bold text-cs-text text-3xl">Automation</h1>
        <p className="text-cs-muted mt-2 max-w-2xl">
          Manage polls, giveaways, sticky messages, scheduled posts, and webhook integrations.
          Everything here can also be triggered by slash commands in Discord — see <strong>Commands</strong> for the full list.
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-cs-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const showBadge = t.premium && !isPremium;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                active ? "border-cs-cyan text-cs-cyan" : "border-transparent text-cs-muted hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {showBadge && <PremiumBadge small />}
            </button>
          );
        })}
      </div>

      {tab === "polls"     && <PollsTab />}
      {tab === "giveaways" && <GiveawaysTab />}
      {tab === "sticky"    && (isPremium ? <StickyTab /> : <PremiumLockCard feature="Sticky Messages" description="Keep important info pinned at the bottom of channels — auto-reposted as new messages arrive." />)}
      {tab === "scheduled" && (isPremium ? <ScheduledTab /> : <PremiumLockCard feature="Scheduled Messages" description="Schedule one-shot or recurring messages (daily/weekly/monthly)." />)}
      {tab === "webhooks"  && (isPremium ? <WebhooksTab />  : <PremiumLockCard feature="Webhook Integrations" description="Receive real-time event payloads at your own URL, HMAC-signed for verification." />)}
    </div>
  );
}

// ══════════════════════════════ POLLS ══════════════════════════════
function PollsTab() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(null);
  const { data: polls = [], isLoading, isError } = useQuery({
    queryKey: ["polls", serverId],
    queryFn: () => getPolls(serverId),
  });
  const closeM  = useMutation({ mutationFn: (id) => closePoll(serverId, id),  onSuccess: () => qc.invalidateQueries({ queryKey: ["polls", serverId] }) });
  const deleteM = useMutation({ mutationFn: (id) => deletePoll(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["polls", serverId] }) });

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg="Couldn't load polls — please retry." />;
  if (!polls.length) return <Empty icon={BarChart3} msg="No polls yet. Run /poll in Discord to create one." />;

  return (
    <div className="space-y-3">
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
              onClick={() => setConfirmState({ title: "Delete Poll", message: "Delete this poll?", onConfirm: () => deleteM.mutate(p.id) })}
              aria-label="Delete poll"
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
        confirmLabel="Delete"
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ══════════════════════════════ GIVEAWAYS ══════════════════════════════
function GiveawaysTab() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(null);
  const { data: giveaways = [], isLoading, isError } = useQuery({
    queryKey: ["giveaways", serverId],
    queryFn: () => getGiveaways(serverId),
  });
  const endM    = useMutation({ mutationFn: (id) => endGiveaway(serverId, id),    onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }) });
  const rerollM = useMutation({ mutationFn: (id) => rerollGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }) });
  const deleteM = useMutation({ mutationFn: (id) => deleteGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }) });

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg="Couldn't load giveaways — please retry." />;
  if (!giveaways.length) return <Empty icon={Gift} msg="No giveaways yet. Run /giveaway start in Discord." />;

  return (
    <div className="space-y-3">
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
                  onClick={() => setConfirmState({ title: "End Giveaway", message: "End giveaway early?", confirmLabel: "End Now", destructive: false, onConfirm: () => endM.mutate(g.id) })}
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
                onClick={() => setConfirmState({ title: "Delete Giveaway", message: "Delete this giveaway?", destructive: true, onConfirm: () => deleteM.mutate(g.id) })}
                aria-label="Delete giveaway"
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
    </div>
  );
}

// ══════════════════════════════ STICKY ══════════════════════════════
function StickyTab() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", embedTitle: "", embedColor: "#33b1ff" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: stickies = [], isLoading, isError } = useQuery({
    queryKey: ["stickies", serverId],
    queryFn: () => getStickies(serverId),
  });
  const saveM   = useMutation({ mutationFn: (data) => upsertSticky(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stickies", serverId] }); setForm({ channelId: "", content: "", embedTitle: "", embedColor: "#33b1ff" }); } });
  const deleteM = useMutation({ mutationFn: (chId) => deleteSticky(serverId, chId), onSuccess: () => qc.invalidateQueries({ queryKey: ["stickies", serverId] }) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); saveM.mutate(form); }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">Set Sticky Message</h3>
        <label className="block">
          <span className="cs-label">Channel ID</span>
          <input required className="cs-input font-mono text-xs" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">Title (optional)</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">Color</span>
            <input type="color" className="cs-input h-10" value={form.embedColor} onChange={(e) => setForm({ ...form, embedColor: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="cs-label">Content</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={saveM.isPending}>
          <Plus className="w-4 h-4" /> Save Sticky
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg="Couldn't load sticky messages — please retry." />}
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
              onClick={() => setConfirmState({ title: "Delete Sticky", message: "Delete this sticky message?", onConfirm: () => deleteM.mutate(s.channelId) })}
              aria-label="Delete sticky message"
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
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: scheduled = [], isLoading, isError } = useQuery({
    queryKey: ["scheduled", serverId],
    queryFn: () => getScheduled(serverId),
  });
  const createM = useMutation({ mutationFn: (data) => createScheduled(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scheduled", serverId] }); setForm({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" }); } });
  const deleteM = useMutation({ mutationFn: (id) => deleteScheduled(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled", serverId] }) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => {
        e.preventDefault();
        createM.mutate({ ...form, recurrence: form.recurrence || null, sendAt: new Date(form.sendAt).toISOString() });
      }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">Schedule New Message</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">Channel ID</span>
            <input required className="cs-input font-mono text-xs" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">Send At (local time)</span>
            <input required type="datetime-local" className="cs-input" value={form.sendAt} onChange={(e) => setForm({ ...form, sendAt: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">Embed Title (optional)</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">Recurrence</span>
            <select className="cs-select" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              <option value="">One-shot</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="cs-label">Content</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={createM.isPending}>
          <Plus className="w-4 h-4" /> Schedule
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg="Couldn't load scheduled messages — please retry." />}
      {!isLoading && !isError && !scheduled.length && <Empty icon={CalendarClock} msg="No scheduled messages yet — create one above." />}

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
              onClick={() => setConfirmState({ title: "Delete Scheduled Message", message: "Delete this scheduled message?", onConfirm: () => deleteM.mutate(m.id) })}
              aria-label="Delete scheduled message"
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
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [], enabled: true });
  const [confirmState, setConfirmState] = useState(null);
  const [formError, setFormError] = useState(null);
  const { data: hooks = [], isLoading, isError } = useQuery({ queryKey: ["webhooks", serverId], queryFn: () => getWebhooks(serverId) });
  const { data: events = {} } = useQuery({ queryKey: ["webhook-events"], queryFn: getWebhookEvents });

  const createM = useMutation({ mutationFn: (data) => createWebhook(serverId, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); } });
  const updateM = useMutation({ mutationFn: ({ id, data }) => updateWebhook(serverId, id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); } });
  const deleteM = useMutation({ mutationFn: (id) => deleteWebhook(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", serverId] }) });

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
      setFormError("Select at least one event to subscribe to.");
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
      {!isLoading && isError && <ErrorCard msg="Couldn't load webhooks — please retry." />}
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
                onClick={() => setConfirmState({ title: "Delete Webhook", message: `Delete "${h.name}"? This cannot be undone.`, onConfirm: () => deleteM.mutate(h.id) })}
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
            <span className="cs-label">Name</span>
            <input required className="cs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <label className="block">
            <span className="cs-label">URL</span>
            <input required type="url" className="cs-input font-mono text-xs" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-service.example.com/webhooks/supreme" />
          </label>

          <label className="block">
            <span className="cs-label">HMAC Secret (optional)</span>
            <input type="password" className="cs-input font-mono text-xs" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Used to sign payloads" />
          </label>

          <fieldset>
            <legend className="cs-label">Events</legend>
            <div className="grid grid-cols-2 gap-2 mt-2">
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

function Empty({ msg, icon }) {
  return <EmptyState icon={icon} title={msg} className="!py-10" />;
}

function ErrorCard({ msg }) {
  return (
    <div role="alert" className="cs-card text-center py-10 text-danger">{msg}</div>
  );
}
