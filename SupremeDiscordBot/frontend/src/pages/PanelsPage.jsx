// frontend/src/pages/PanelsPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Pencil, Copy, Layout as LayoutIcon } from "lucide-react";
import { getPanels, createPanel, updatePanel, deletePanel, spawnPanel, duplicatePanel, getForms } from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { useToast } from "../contexts/ToastContext";

const BUTTON_STYLES = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"];
const STYLE_COLORS = {
  PRIMARY: "bg-cs-cyan",
  SECONDARY: "bg-gray-500",
  SUCCESS: "bg-green-600",
  DANGER: "bg-red-600",
};

const defaultForm = () => ({
  name: "", title: "", description: "", color: "#5865F2",
  // Legacy
  namingTemplate: "ticket-{username}",
  maxOpenPerUser: 1,
  // v1.5 — TicketTool parity
  channelNamePrefix: "ticket",
  counterPadding: 4,
  categoryOpenId: "",
  categoryClosedId: "",
  logChannelId: "",
  transcriptChannelId: "",
  welcomeMessage: "",
  welcomeEmbedColor: "#33b1ff",
  closeAskEnabled: true,
  closeAskMessage: "",
  dmOnOpen: false,
  dmOnOpenMessage: "",
  dmOnClose: false,
  dmOnCloseMessage: "",
  observerRoleIds: "",
  supportRoleIds: "",
  maxOpenPerUserPanel: "",
  buttonStyle: "BUTTON",
  inactivityCloseHours: "",
  autoCloseOnLeave: false,
  feedbackEnabled: false,
  // v1.7 verification gate
  requireVerifiedRoleIds: "",
  verificationDeniedMessage: "",
  buttons: [{ label: "Open Ticket", emoji: "🎫", style: "PRIMARY", formId: "" }],
});

function panelToForm(panel) {
  return {
    name: panel.name,
    title: panel.title,
    description: panel.description || "",
    color: panel.color || "#5865F2",
    namingTemplate: panel.namingTemplate || "ticket-{username}",
    maxOpenPerUser: panel.maxOpenPerUser || 1,
    channelNamePrefix: panel.channelNamePrefix || "ticket",
    counterPadding: panel.counterPadding ?? 4,
    categoryOpenId: panel.categoryOpenId || panel.categoryId || "",
    categoryClosedId: panel.categoryClosedId || "",
    logChannelId: panel.logChannelId || "",
    transcriptChannelId: panel.transcriptChannelId || "",
    welcomeMessage: panel.welcomeMessage || "",
    welcomeEmbedColor: panel.welcomeEmbedColor || "#33b1ff",
    closeAskEnabled: panel.closeAskEnabled ?? true,
    closeAskMessage: panel.closeAskMessage || "",
    dmOnOpen: !!panel.dmOnOpen,
    dmOnOpenMessage: panel.dmOnOpenMessage || "",
    dmOnClose: !!panel.dmOnClose,
    dmOnCloseMessage: panel.dmOnCloseMessage || "",
    observerRoleIds: (panel.observerRoleIds || []).join(","),
    supportRoleIds: (panel.supportRoleIds || []).join(","),
    maxOpenPerUserPanel: panel.maxOpenPerUserPanel ?? "",
    buttonStyle: panel.buttonStyle || "BUTTON",
    inactivityCloseHours: panel.inactivityCloseHours ?? "",
    autoCloseOnLeave: !!panel.autoCloseOnLeave,
    feedbackEnabled: !!panel.feedbackEnabled,
    // v1.7 verification gate
    requireVerifiedRoleIds: (panel.requireVerifiedRoleIds || []).join(","),
    verificationDeniedMessage: panel.verificationDeniedMessage || "",
    buttons: (panel.buttons || []).map((b) => ({
      label: b.label,
      emoji: b.emoji || "",
      style: b.style || "PRIMARY",
      formId: b.formId || "",
    })),
  };
}

export default function PanelsPage() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const { isPremium } = usePremium();

  // editing: null = closed, "new" = create modal, string = panelId being edited
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [spawnInputs, setSpawnInputs] = useState({});
  const [confirmState, setConfirmState] = useState(null);

  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["panels", serverId],
    queryFn: () => getPanels(serverId),
  });

  // v2.1 — load forms for button → form linking
  const { data: forms = [] } = useQuery({
    queryKey: ["forms", serverId],
    queryFn: () => getForms(serverId),
  });

  const toast = useToast();
  const mutErrorMsg = (err, fallback) => err?.response?.data?.error || fallback;

  const createMut = useMutation({
    mutationFn: (data) => createPanel(serverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      setEditing(null);
      toast.success("Panel created.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, "Failed to create panel.")),
  });

  const updateMut = useMutation({
    mutationFn: ({ panelId, data }) => updatePanel(serverId, panelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      setEditing(null);
      toast.success("Panel updated.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, "Failed to update panel.")),
  });

  const deleteMut = useMutation({
    mutationFn: (panelId) => deletePanel(serverId, panelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success("Panel deleted.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, "Failed to delete panel.")),
  });

  const spawnMut = useMutation({
    mutationFn: ({ panelId, channelId }) => spawnPanel(serverId, panelId, channelId),
    onSuccess: (_data, { panelId }) => {
      setSpawnInputs((s) => ({ ...s, [panelId]: "" }));
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success("Panel spawned to channel.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, "Failed to spawn panel — check the channel ID.")),
  });

  const duplicateMut = useMutation({
    mutationFn: (panelId) => duplicatePanel(serverId, panelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success("Panel duplicated.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, "Failed to duplicate panel.")),
  });

  const openNew = () => { setForm(defaultForm()); setEditing("new"); };
  const openEdit = (panel) => { setForm(panelToForm(panel)); setEditing(panel.id); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const csvToArray = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
    const payload = {
      ...form,
      observerRoleIds: csvToArray(form.observerRoleIds),
      supportRoleIds:  csvToArray(form.supportRoleIds),
      requireVerifiedRoleIds: csvToArray(form.requireVerifiedRoleIds),
      verificationDeniedMessage: form.verificationDeniedMessage || null,
      maxOpenPerUserPanel:  form.maxOpenPerUserPanel  === "" ? null : Number(form.maxOpenPerUserPanel),
      inactivityCloseHours: form.inactivityCloseHours === "" ? null : Number(form.inactivityCloseHours),
      counterPadding:       Number(form.counterPadding) || 4,
      maxOpenPerUser:       Number(form.maxOpenPerUser) || 1,
    };
    if (editing === "new") {
      createMut.mutate(payload);
    } else {
      updateMut.mutate({ panelId: editing, data: payload });
    }
  };

  const addButton = () => {
    if (form.buttons.length >= 5) return;
    setForm((f) => ({ ...f, buttons: [...f.buttons, { label: "New Button", emoji: "", style: "PRIMARY", formId: "" }] }));
  };

  const updateButton = (i, key, val) => {
    setForm((f) => ({ ...f, buttons: f.buttons.map((b, idx) => idx === i ? { ...b, [key]: val } : b) }));
  };

  const removeButton = (i) => {
    if (form.buttons.length <= 1) return; // must have at least 1
    setForm((f) => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));
  };

  const isModalOpen = editing !== null;
  const isPending = createMut.isPending || updateMut.isPending;
  const mutError = createMut.error || updateMut.error;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cs-text">Panels</h1>
          <p className="text-cs-muted text-sm mt-1">Create visual button panels for ticket creation</p>
        </div>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Panel
        </button>
      </div>

      {/* Panel list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />
          ))}
        </div>
      ) : panels.length === 0 ? (
        <EmptyState
          icon={LayoutIcon}
          title="No panels yet"
          description="Create a button panel so members can open tickets with one click."
          ctaLabel="Create first panel"
          onCtaClick={openNew}
        />
      ) : (
        <div className="space-y-4">
          {panels.map((panel) => (
            <div key={panel.id} className="cs-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: panel.color }} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-cs-text truncate">{panel.name}</h3>
                    <p className="text-sm text-cs-muted truncate">{panel.title}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Button previews */}
                  <div className="hidden sm:flex gap-1">
                    {panel.buttons.map((b) => (
                      <span key={b.id} className={`text-xs text-cs-text px-2 py-0.5 rounded ${STYLE_COLORS[b.style] || "bg-gray-600"}`}>
                        {b.emoji} {b.label}
                      </span>
                    ))}
                  </div>

                  {/* Spawn input */}
                  <div className="flex items-center gap-1">
                    <input
                      placeholder="Channel ID"
                      aria-label="Channel ID to post panel in"
                      className="cs-input text-xs w-28 py-1"
                      value={spawnInputs[panel.id] || ""}
                      onChange={(e) => setSpawnInputs((s) => ({ ...s, [panel.id]: e.target.value }))}
                    />
                    <button
                      className="cs-btn-primary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                      disabled={!spawnInputs[panel.id] || spawnMut.isPending}
                      onClick={() => spawnMut.mutate({ panelId: panel.id, channelId: spawnInputs[panel.id] })}
                    >
                      <Send className="w-3 h-3" /> Post to channel
                    </button>
                  </div>

                  <button
                    aria-label="Edit panel"
                    title="Edit panel"
                    onClick={() => openEdit(panel)}
                    className="text-cs-muted hover:text-white transition-colors p-1"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    aria-label={isPremium ? "Duplicate panel" : "Duplicate panel (Premium)"}
                    title={isPremium ? "Duplicate panel" : "Duplicate panel (Premium)"}
                    onClick={() => isPremium ? duplicateMut.mutate(panel.id) : window.dispatchEvent(new CustomEvent("premium-required", { detail: { error: "Panel duplication requires Premium.", featureLabel: "Panel Duplicate" } }))}
                    disabled={duplicateMut.isPending}
                    className={`transition-colors p-1 disabled:opacity-40 ${isPremium ? "text-cs-cyan hover:opacity-80" : "text-cs-gold hover:text-cs-goldDim"}`}
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    aria-label="Delete panel"
                    title="Delete panel"
                    className="text-danger hover:text-red-300 transition-colors p-1"
                    onClick={() => setConfirmState({
                      title: "Delete panel",
                      message: `Delete panel "${panel.name}"?`,
                      onConfirm: () => { deleteMut.mutate(panel.id); setConfirmState(null); },
                    })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {panel.channelId && (
                <p className="text-xs text-success mt-2">✅ Active in channel <code className="text-xs">{panel.channelId}</code></p>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteMut.isError && (
        <div className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500/30 text-danger text-sm px-4 py-3 rounded-lg z-50">
          ❌ {deleteMut.error?.response?.data?.error || "Failed to delete panel"}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New panel" : "Edit panel"}
        maxWidth="max-w-2xl"
      >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="cs-label">Internal Name *</span>
                  <input className="cs-input" required value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Support Panel" />
                </label>
                <label className="block">
                  <span className="cs-label">Embed Color</span>
                  <input type="color" className="cs-input h-10 cursor-pointer" value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                </label>
              </div>

              <label className="block">
                <span className="cs-label">Embed Title *</span>
                <input className="cs-input" required value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="🎫 Support Tickets" />
              </label>

              <label className="block">
                <span className="cs-label">Embed Description</span>
                <textarea className="cs-input" rows={2} value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Click a button below to open a ticket." />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="cs-label">Ticket Naming Template</span>
                  <input className="cs-input" value={form.namingTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, namingTemplate: e.target.value }))}
                    placeholder="ticket-{username}" />
                  <p className="text-xs text-cs-muted mt-1">{"Variables: {username}, {id}, {count}"}</p>
                </label>
                <label className="block">
                  <span className="cs-label">Max Open Tickets / User</span>
                  <input type="number" className="cs-input" min={1} max={10}
                    value={form.maxOpenPerUser}
                    onChange={(e) => setForm((f) => ({ ...f, maxOpenPerUser: Number(e.target.value) }))} />
                  <p className="text-xs text-cs-muted mt-1">How many open tickets one user can have</p>
                </label>
              </div>

              {/* ═══════ v1.5 — TicketTool Parity ═══════ */}

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Categories & Channels</summary>
                <div className="pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">Open Category ID</span>
                      <input className="cs-input font-mono text-xs" value={form.categoryOpenId}
                        onChange={(e) => setForm((f) => ({ ...f, categoryOpenId: e.target.value }))}
                        placeholder="Discord category where tickets open" />
                    </label>
                    <label className="block">
                      <span className="cs-label">Closed Category ID</span>
                      <input className="cs-input font-mono text-xs" value={form.categoryClosedId}
                        onChange={(e) => setForm((f) => ({ ...f, categoryClosedId: e.target.value }))}
                        placeholder="Where tickets move after close" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">Log Channel ID</span>
                      <input className="cs-input font-mono text-xs" value={form.logChannelId}
                        onChange={(e) => setForm((f) => ({ ...f, logChannelId: e.target.value }))}
                        placeholder="Staff event log" />
                    </label>
                    <label className="block">
                      <span className="cs-label">Transcript Channel ID</span>
                      <input className="cs-input font-mono text-xs" value={form.transcriptChannelId}
                        onChange={(e) => setForm((f) => ({ ...f, transcriptChannelId: e.target.value }))}
                        placeholder="HTML transcripts on delete" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="cs-label">Channel Name Prefix</span>
                      <input className="cs-input" value={form.channelNamePrefix}
                        onChange={(e) => setForm((f) => ({ ...f, channelNamePrefix: e.target.value }))}
                        placeholder="ticket" />
                    </label>
                    <label className="block">
                      <span className="cs-label">Counter Padding</span>
                      <input type="number" className="cs-input" min={1} max={8} value={form.counterPadding}
                        onChange={(e) => setForm((f) => ({ ...f, counterPadding: e.target.value }))} />
                      <p className="text-xs text-cs-dim mt-1">4 = "0042"</p>
                    </label>
                    <label className="block">
                      <span className="cs-label">Button Style</span>
                      <select className="cs-select" value={form.buttonStyle}
                        onChange={(e) => setForm((f) => ({ ...f, buttonStyle: e.target.value }))}>
                        <option value="BUTTON">Buttons</option>
                        <option value="DROPDOWN">Dropdown</option>
                        <option value="THREAD">Private Threads</option>
                      </select>
                    </label>
                  </div>
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Welcome Message & Roles</summary>
                <div className="pt-4 space-y-3">
                  <label className="block">
                    <span className="cs-label">Welcome Message (markdown + variables)</span>
                    <textarea className="cs-textarea" rows={4} value={form.welcomeMessage}
                      onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
                      placeholder="Hello {user}, welcome to your ticket #{ticket.count}. Support will be with you shortly." />
                    <p className="text-xs text-cs-dim mt-1">
                      {"Variables: {user}, {user.name}, {ticket}, {ticket.count}, {ticket.number}, {server}, {panel.name}, {staff}, {date}, {time}"}
                    </p>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">Welcome Embed Color</span>
                      <input type="color" className="cs-input h-10" value={form.welcomeEmbedColor}
                        onChange={(e) => setForm((f) => ({ ...f, welcomeEmbedColor: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="cs-label">Max Tickets Per User (this panel)</span>
                      <input type="number" className="cs-input" min={0} value={form.maxOpenPerUserPanel}
                        onChange={(e) => setForm((f) => ({ ...f, maxOpenPerUserPanel: e.target.value }))}
                        placeholder="Leave empty for no panel-specific limit" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="cs-label">Support Role IDs (comma-separated)</span>
                    <input className="cs-input font-mono text-xs" value={form.supportRoleIds}
                      onChange={(e) => setForm((f) => ({ ...f, supportRoleIds: e.target.value }))}
                      placeholder="Full ticket access" />
                  </label>
                  <label className="block">
                    <span className="cs-label">Observer Role IDs (view-only)</span>
                    <input className="cs-input font-mono text-xs" value={form.observerRoleIds}
                      onChange={(e) => setForm((f) => ({ ...f, observerRoleIds: e.target.value }))}
                      placeholder="Can see but not talk in tickets" />
                  </label>
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Close Behavior {!isPremium && <PremiumBadge small />}</summary>
                <div className="pt-4 space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.closeAskEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, closeAskEnabled: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">Two-step close (show confirmation before closing)</span>
                  </label>
                  {form.closeAskEnabled && (
                    <label className="block">
                      <span className="cs-label">Close Confirmation Message</span>
                      <textarea className="cs-textarea" rows={2} value={form.closeAskMessage}
                        onChange={(e) => setForm((f) => ({ ...f, closeAskMessage: e.target.value }))}
                        placeholder="Are you sure you want to close this ticket, {user}?" />
                    </label>
                  )}
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ DM Notifications {!isPremium && <PremiumBadge small />}</summary>
                <div className="pt-4 space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.dmOnOpen}
                      onChange={(e) => setForm((f) => ({ ...f, dmOnOpen: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">DM the user when their ticket opens</span>
                  </label>
                  {form.dmOnOpen && (
                    <label className="block">
                      <span className="cs-label">Open DM Message</span>
                      <textarea className="cs-textarea" rows={3} value={form.dmOnOpenMessage}
                        onChange={(e) => setForm((f) => ({ ...f, dmOnOpenMessage: e.target.value }))}
                        placeholder="Your ticket in {server} has been created! We'll respond soon." />
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.dmOnClose}
                      onChange={(e) => setForm((f) => ({ ...f, dmOnClose: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">DM the user when their ticket closes</span>
                  </label>
                  {form.dmOnClose && (
                    <label className="block">
                      <span className="cs-label">Close DM Message</span>
                      <textarea className="cs-textarea" rows={3} value={form.dmOnCloseMessage}
                        onChange={(e) => setForm((f) => ({ ...f, dmOnCloseMessage: e.target.value }))}
                        placeholder="Your ticket in {server} has been closed. Thanks for reaching out!" />
                    </label>
                  )}
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Automation {!isPremium && <PremiumBadge small />}</summary>
                <div className="pt-4 space-y-3">
                  <label className="block">
                    <span className="cs-label">Inactivity Auto-Close (hours)</span>
                    <input type="number" className="cs-input" min={1} value={form.inactivityCloseHours}
                      onChange={(e) => setForm((f) => ({ ...f, inactivityCloseHours: e.target.value }))}
                      placeholder="24 = close after 1 day of no activity" />
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.autoCloseOnLeave}
                      onChange={(e) => setForm((f) => ({ ...f, autoCloseOnLeave: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">Auto-close ticket when creator leaves the server</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.feedbackEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, feedbackEnabled: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">DM feedback rating prompt after close (1-5 stars)</span>
                  </label>
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Verification Gate (v1.7)</summary>
                <div className="pt-4 space-y-3">
                  <p className="text-xs text-cs-dim">
                    Require users to have specific roles before they can open a ticket on this panel. Pair with a Verification Panel (see sidebar) that grants these roles.
                  </p>
                  <label className="block">
                    <span className="cs-label">Required Role IDs (comma-separated — user must have ALL)</span>
                    <input className="cs-input font-mono text-xs" value={form.requireVerifiedRoleIds}
                      onChange={(e) => setForm((f) => ({ ...f, requireVerifiedRoleIds: e.target.value }))}
                      placeholder="Verified, Member" />
                  </label>
                  <label className="block">
                    <span className="cs-label">Custom Denied Message (shown when user lacks required roles)</span>
                    <textarea className="cs-textarea" rows={3} value={form.verificationDeniedMessage}
                      onChange={(e) => setForm((f) => ({ ...f, verificationDeniedMessage: e.target.value }))}
                      placeholder="❌ You need to verify first. Please visit #verify to complete the challenge." />
                  </label>
                </div>
              </details>

              {/* Buttons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="cs-label">Buttons ({form.buttons.length}/5)</span>
                  <button type="button" onClick={addButton}
                    disabled={form.buttons.length >= 5}
                    className="text-cs-cyan hover:text-cs-cyan text-sm transition-colors disabled:opacity-40">
                    + Add Button
                  </button>
                </div>
                <div className="space-y-2">
                  {form.buttons.map((btn, i) => (
                    <div key={i} className="bg-cs-bg rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 flex-wrap items-center">
                        <input className="cs-input w-16 py-1 text-sm" value={btn.emoji}
                          aria-label={`Button ${i + 1} emoji`}
                          onChange={(e) => updateButton(i, "emoji", e.target.value)}
                          placeholder="🎫" />
                        <input className="cs-input flex-1 min-w-[100px] py-1 text-sm" value={btn.label}
                          aria-label={`Button ${i + 1} label`}
                          onChange={(e) => updateButton(i, "label", e.target.value)}
                          placeholder="Button Label" required />
                        <select className="cs-input py-1 text-sm w-28" value={btn.style}
                          aria-label={`Button ${i + 1} style`}
                          onChange={(e) => updateButton(i, "style", e.target.value)}>
                          {BUTTON_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {form.buttons.length > 1 && (
                          <button type="button" onClick={() => removeButton(i)}
                            aria-label={`Remove button ${i + 1}`}
                            title="Remove button"
                            className="text-danger hover:text-red-300 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-xs text-cs-muted whitespace-nowrap" htmlFor={`button-action-${i}`}>Action:</label>
                        <select
                          id={`button-action-${i}`}
                          className="cs-input py-1 text-sm flex-1"
                          value={btn.formId || ""}
                          onChange={(e) => updateButton(i, "formId", e.target.value)}
                        >
                          <option value="">🎫 Create ticket directly</option>
                          {forms.filter((f) => !f.isApplication).length > 0 && (
                            <optgroup label="📝 Ask questions first (form)">
                              {forms.filter((f) => !f.isApplication).map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {forms.filter((f) => f.isApplication).length > 0 && (
                            <optgroup label="📋 Submit as application">
                              {forms.filter((f) => f.isApplication).map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {mutError && (
                <p className="text-danger text-sm">
                  ❌ {mutError?.response?.data?.error || "Operation failed"}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="cs-btn-ghost">Cancel</button>
                <button type="submit" className="cs-btn-primary" disabled={isPending}>
                  {isPending ? "Saving…" : editing === "new" ? "Create Panel" : "Save Changes"}
                </button>
              </div>
            </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        destructive
        confirmLabel="Delete"
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
