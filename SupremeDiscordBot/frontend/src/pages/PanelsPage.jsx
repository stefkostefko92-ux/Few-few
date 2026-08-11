// frontend/src/pages/PanelsPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect } from "../components/DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Pencil, Copy, Layout as LayoutIcon } from "lucide-react";
import { getPanels, createPanel, updatePanel, deletePanel, spawnPanel, spawnPanelGroup, duplicatePanel, getForms } from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import EmojiPicker from "../components/EmojiPicker";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

// Discord таван: 25 опции в падащо меню, 25 бутона (5 реда × 5). Ботът вече
// реди бутоните по редове (utils/embed.js), а backend-ът валидира същото число
// (routes/panels.js) — трите места трябва да се движат заедно.
const MAX_PANEL_BUTTONS = 25;

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
  defaultPriority: "NORMAL",
  // v1.5 — TicketTool parity
  channelNamePrefix: "ticket",
  counterPadding: 4,
  categoryOpenId: "",
  categoryClosedId: "",
  logChannelId: "",
  transcriptChannelId: "",
  welcomeMessage: "",
  welcomeEmbedColor: "#8fe600",
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
  slaFirstResponseMinutes: "",
  slaResolutionMinutes: "",
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
    defaultPriority: panel.defaultPriority || "NORMAL",
    channelNamePrefix: panel.channelNamePrefix || "ticket",
    counterPadding: panel.counterPadding ?? 4,
    categoryOpenId: panel.categoryOpenId || panel.categoryId || "",
    categoryClosedId: panel.categoryClosedId || "",
    logChannelId: panel.logChannelId || "",
    transcriptChannelId: panel.transcriptChannelId || "",
    welcomeMessage: panel.welcomeMessage || "",
    welcomeEmbedColor: panel.welcomeEmbedColor || "#8fe600",
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
    slaFirstResponseMinutes: panel.slaFirstResponseMinutes ?? "",
    slaResolutionMinutes: panel.slaResolutionMinutes ?? "",
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
  const { t } = useT();
  const qc = useQueryClient();
  const { isPremium } = usePremium();

  // editing: null = closed, "new" = create modal, string = panelId being edited
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [spawnInputs, setSpawnInputs] = useState({});
  // Групово публикуване (няколко панела → едно съобщение)
  const [groupMode, setGroupMode] = useState(false);
  const [groupIds, setGroupIds] = useState([]);
  const [groupChannel, setGroupChannel] = useState("");
  const [groupStyle, setGroupStyle] = useState("DROPDOWN");
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
      toast.success(t("panels.created"));
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.createFailed"))),
  });

  const updateMut = useMutation({
    mutationFn: ({ panelId, data }) => updatePanel(serverId, panelId, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      setEditing(null);
      // botWarning = записът мина, но живото Discord съобщение НЕ се обнови —
      // казваме го честно, вместо да рапортуваме пълен успех (лъжещ успех).
      if (data?.botWarning) toast.error(data.botWarning);
      else toast.success("Panel updated.");
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.updateFailed"))),
  });

  const deleteMut = useMutation({
    mutationFn: (panelId) => deletePanel(serverId, panelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success(t("panels.deleted"));
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.deleteFailed"))),
  });

  const spawnMut = useMutation({
    mutationFn: ({ panelId, channelId }) => spawnPanel(serverId, panelId, channelId),
    onSuccess: (_data, { panelId }) => {
      setSpawnInputs((s) => ({ ...s, [panelId]: "" }));
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success(t("panels.spawned"));
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.spawnFailed"))),
  });

  const spawnGroupMut = useMutation({
    mutationFn: ({ panelIds, channelId }) => spawnPanelGroup(serverId, panelIds, channelId, groupStyle),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      setGroupMode(false); setGroupIds([]); setGroupChannel("");
      // Ботът може да е прескочил панели, които не се побират в лимитите на
      // Discord — казваме го честно, вместо да рапортуваме пълен успех.
      if (data?.skipped?.length) {
        toast.error(t("panels.group.partial", { posted: data.posted, skipped: data.skipped.length }));
      } else {
        toast.success(t("panels.group.posted", { n: data?.posted ?? 0 }));
      }
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.spawnFailed"))),
  });

  const duplicateMut = useMutation({
    mutationFn: (panelId) => duplicatePanel(serverId, panelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["panels", serverId] });
      toast.success(t("panels.duplicated"));
    },
    onError: (err) => toast.error(mutErrorMsg(err, t("panels.duplicateFailed"))),
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
      slaFirstResponseMinutes: form.slaFirstResponseMinutes === "" ? null : Number(form.slaFirstResponseMinutes),
      slaResolutionMinutes: form.slaResolutionMinutes === "" ? null : Number(form.slaResolutionMinutes),
      counterPadding:       Number(form.counterPadding) || 4,
      maxOpenPerUser:       Number(form.maxOpenPerUser) || 1,
      defaultPriority:      form.defaultPriority,
    };
    if (editing === "new") {
      createMut.mutate(payload);
    } else {
      updateMut.mutate({ panelId: editing, data: payload });
    }
  };

  const addButton = () => {
    if (form.buttons.length >= MAX_PANEL_BUTTONS) return;
    setForm((f) => ({ ...f, buttons: [...f.buttons, { label: t("panels.newButton"), emoji: "", style: "PRIMARY", formId: "" }] }));
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cs-text">{t("panels.title")}</h1>
          <p className="text-cs-muted text-sm mt-1">
            {t("panels.subtitle")}{" "}
            {/* Контекстна връзка към публичната docs страница за настройка. */}
            <a href="/guides/ticket-panel-setup" target="_blank" rel="noopener"
               className="text-cs-cyan hover:underline whitespace-nowrap">
              {t("panels.setupGuide")} →
            </a>
          </p>
        </div>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t("panels.new")}
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
          title={t("panels.empty.title")}
          description={t("panels.empty.body")}
          ctaLabel={t("panels.empty.cta")}
          onCtaClick={openNew}
        />
      ) : (
        <div className="space-y-4">
          {/* ─── Групово публикуване: няколко панела в ЕДНО съобщение ───────
              Discord дава 10 embed-а и 5 реда компоненти на съобщение; всеки
              панел яде 1 embed + 1 ред (падащо меню) или по 1 ред на 5 бутона.
              Бекендът маркира всички с общ messageId, за да се пресглобяват
              заедно при редакция. */}
          {panels.length >= 2 && (
            <div className="cs-card border-cs-cyan/30">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <LayoutIcon className="w-4 h-4 text-cs-cyan" aria-hidden="true" />
                  <span className="font-semibold text-cs-text">{t("panels.group.title")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setGroupMode((v) => !v); setGroupIds([]); }}
                  className="cs-btn-secondary text-xs"
                >
                  {groupMode ? t("common.cancel") : t("panels.group.start")}
                </button>
              </div>
              <p className="text-xs text-cs-dim">{t("panels.group.hint")}</p>

              {groupMode && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="cs-input flex-1 min-w-[180px] py-1 text-sm"
                    placeholder={t("panels.ph.channelId")}
                    aria-label={t("panels.group.channel")}
                    value={groupChannel}
                    onChange={(e) => setGroupChannel(e.target.value)}
                  />
                  <select
                    className="cs-input py-1 text-sm w-52"
                    value={groupStyle}
                    onChange={(e) => setGroupStyle(e.target.value)}
                    aria-label={t("panels.group.style")}
                  >
                    <option value="DROPDOWN">{t("panels.group.style.dropdown")}</option>
                    <option value="BUTTONS">{t("panels.group.style.buttons")}</option>
                    <option value="STACK">{t("panels.group.style.stack")}</option>
                  </select>
                  <span className="text-xs text-cs-muted tabular-nums">
                    {t("panels.group.selected", { n: groupIds.length })}
                  </span>
                  <button
                    type="button"
                    className="cs-btn-primary text-xs flex items-center gap-2 disabled:opacity-40"
                    disabled={groupIds.length < 2 || !groupChannel || spawnGroupMut.isPending}
                    onClick={() => spawnGroupMut.mutate({ panelIds: groupIds, channelId: groupChannel })}
                  >
                    <Send className="w-3 h-3" aria-hidden="true" />
                    {spawnGroupMut.isPending ? t("common.sending") : t("panels.group.post")}
                  </button>
                </div>
              )}
            </div>
          )}

          {panels.map((panel) => (
            <div key={panel.id} className={`cs-card ${groupMode && groupIds.includes(panel.id) ? "border-cs-cyan" : ""}`}>
              {groupMode && (
                <label className="flex items-center gap-2 mb-2 text-sm text-cs-text cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-cs-cyan"
                    checked={groupIds.includes(panel.id)}
                    onChange={() => setGroupIds((ids) =>
                      ids.includes(panel.id) ? ids.filter((x) => x !== panel.id) : [...ids, panel.id])}
                  />
                  {t("panels.group.include")}
                  {groupIds.includes(panel.id) && (
                    <span className="text-xs text-cs-cyan tabular-nums">#{groupIds.indexOf(panel.id) + 1}</span>
                  )}
                </label>
              )}
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: panel.color }} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-cs-text truncate">{panel.name}</h3>
                    <p className="text-sm text-cs-muted truncate">{panel.title}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                    <div className="flex-1 min-w-[11rem] sm:flex-none sm:w-44">
                      <DiscordChannelSelect kind="text" value={spawnInputs[panel.id] || ""}
                        onChange={(v) => setSpawnInputs((s) => ({ ...s, [panel.id]: v }))} />
                    </div>
                    <button
                      className="cs-btn-primary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                      disabled={!spawnInputs[panel.id] || spawnMut.isPending}
                      onClick={() => spawnMut.mutate({ panelId: panel.id, channelId: spawnInputs[panel.id] })}
                    >
                      <Send className="w-3 h-3" /> Post to channel
                    </button>
                  </div>

                  <button
                    aria-label={t("panels.edit")}
                    title={t("panels.edit")}
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
                    aria-label={t("panels.delete")}
                    title={t("panels.delete")}
                    className="text-danger hover:text-red-300 transition-colors p-1"
                    onClick={() => setConfirmState({
                      title: t("panels.delete"),
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="cs-label">{t("ui.internalNameReq")}</span>
                  <input className="cs-input" required value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("panels.ph.supportPanel")} />
                </label>
                <label className="block">
                  <span className="cs-label">{t("panels.embedColor")}</span>
                  <input type="color" className="cs-input h-10 cursor-pointer" value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                </label>
              </div>

              <label className="block">
                <span className="cs-label">{t("ui.embedTitleReq")}</span>
                <input className="cs-input" required value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t("panels.ph.title")} />
              </label>

              <label className="block">
                <span className="cs-label">{t("panels.embedDescription")}</span>
                <textarea className="cs-input" rows={2} value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("panels.ph.clickButton")} />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="cs-label">{t("panels.namingTemplate")}</span>
                  <input className="cs-input" value={form.namingTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, namingTemplate: e.target.value }))}
                    placeholder={t("panels.ph.namingTemplate")} />
                  <p className="text-xs text-cs-muted mt-1">{t("panels.varsSimple")}</p>
                </label>
                <label className="block">
                  <span className="cs-label">{t("ui.maxOpenPerUser")}</span>
                  <input type="number" className="cs-input" min={1} max={10}
                    value={form.maxOpenPerUser}
                    onChange={(e) => setForm((f) => ({ ...f, maxOpenPerUser: Number(e.target.value) }))} />
                  <p className="text-xs text-cs-dim mt-1">{t("ui.maxOpenPerUserHint")}</p>
                </label>
                <label className="block">
                  <span className="cs-label">{t("ui.defaultPriority")}</span>
                  <select className="cs-input" value={form.defaultPriority}
                    onChange={(e) => setForm((f) => ({ ...f, defaultPriority: e.target.value }))}>
                    <option value="LOW">{t("priority.low")}</option>
                    <option value="NORMAL">{t("priority.normal")}</option>
                    <option value="HIGH">{t("priority.high")}</option>
                    <option value="URGENT">{t("priority.urgent")}</option>
                  </select>
                  <p className="text-xs text-cs-dim mt-1">{t("ui.defaultPriorityHint")}</p>
                </label>
              </div>

              {/* ═══════ v1.5 — TicketTool Parity ═══════ */}

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Categories & Channels</summary>
                <div className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">{t("panels.openCategory")}</span>
                      <DiscordChannelSelect kind="category" value={form.categoryOpenId}
                        onChange={(v) => setForm((f) => ({ ...f, categoryOpenId: v }))} />
                    </label>
                    <label className="block">
                      <span className="cs-label">{t("panels.closedCategory")}</span>
                      <DiscordChannelSelect kind="category" value={form.categoryClosedId}
                        onChange={(v) => setForm((f) => ({ ...f, categoryClosedId: v }))} />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">{t("panels.logChannel")}</span>
                      <DiscordChannelSelect kind="text" value={form.logChannelId}
                        onChange={(v) => setForm((f) => ({ ...f, logChannelId: v }))}
                        placeholder={t("panels.ph.staffLog")} />
                    </label>
                    <label className="block">
                      <span className="cs-label">{t("panels.transcriptChannel")}</span>
                      <DiscordChannelSelect kind="text" value={form.transcriptChannelId}
                        onChange={(v) => setForm((f) => ({ ...f, transcriptChannelId: v }))}
                        placeholder={t("panels.ph.htmlTranscripts")} />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="cs-label">{t("panels.channelPrefix")}</span>
                      <input className="cs-input" value={form.channelNamePrefix}
                        onChange={(e) => setForm((f) => ({ ...f, channelNamePrefix: e.target.value }))}
                        placeholder={t("panels.ph.prefix")} />
                    </label>
                    <label className="block">
                      <span className="cs-label">{t("panels.counterPadding")}</span>
                      <input type="number" className="cs-input" min={1} max={8} value={form.counterPadding}
                        onChange={(e) => setForm((f) => ({ ...f, counterPadding: e.target.value }))} />
                      <p className="text-xs text-cs-dim mt-1">4 = "0042"</p>
                    </label>
                  </div>
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Welcome Message & Roles</summary>
                <div className="pt-4 space-y-3">
                  <label className="block">
                    <span className="cs-label">{t("ui.welcomeMsgMd")}</span>
                    <textarea className="cs-textarea" rows={4} value={form.welcomeMessage}
                      onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
                      placeholder={t("panels.ph.welcomeDm")} />
                    <p className="text-xs text-cs-dim mt-1">
                      {t("panels.varsFull")}
                    </p>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">{t("panels.welcomeEmbedColor")}</span>
                      <input type="color" className="cs-input h-10" value={form.welcomeEmbedColor}
                        onChange={(e) => setForm((f) => ({ ...f, welcomeEmbedColor: e.target.value }))} />
                    </label>
                    <label className="block">
                      <span className="cs-label">{t("ui.maxPerUserPanel")}</span>
                      <input type="number" className="cs-input" min={0} value={form.maxOpenPerUserPanel}
                        onChange={(e) => setForm((f) => ({ ...f, maxOpenPerUserPanel: e.target.value }))}
                        placeholder={t("panels.ph.limit")} />
                      <p className="text-xs text-cs-dim mt-1">{t("ui.maxPerUserPanelHint")}</p>
                    </label>
                  </div>
                  <label className="block">
                    <span className="cs-label">{t("ui.supportRolesFull")}</span>
                    <DiscordRoleSelect multi value={form.supportRoleIds} onChange={(v) => setForm((f) => ({ ...f, supportRoleIds: v }))} requireAssignable={false} />
                  </label>
                  <label className="block">
                    <span className="cs-label">{t("ui.observerRoles")}</span>
                    <DiscordRoleSelect multi value={form.observerRoleIds} onChange={(v) => setForm((f) => ({ ...f, observerRoleIds: v }))} requireAssignable={false} />
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
                      <span className="cs-label">{t("panels.closeConfirm")}</span>
                      <textarea className="cs-textarea" rows={2} value={form.closeAskMessage}
                        onChange={(e) => setForm((f) => ({ ...f, closeAskMessage: e.target.value }))}
                        placeholder={t("panels.ph.closeConfirm")} />
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
                    <span className="text-sm text-cs-text">{t("panels.dmOnOpen")}</span>
                  </label>
                  {form.dmOnOpen && (
                    <label className="block">
                      <span className="cs-label">{t("panels.openDm")}</span>
                      <textarea className="cs-textarea" rows={3} value={form.dmOnOpenMessage}
                        onChange={(e) => setForm((f) => ({ ...f, dmOnOpenMessage: e.target.value }))}
                        placeholder={t("panels.ph.openDm")} />
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.dmOnClose}
                      onChange={(e) => setForm((f) => ({ ...f, dmOnClose: e.target.checked }))}
                      className="accent-cs-cyan" />
                    <span className="text-sm text-cs-text">{t("panels.dmOnClose")}</span>
                  </label>
                  {form.dmOnClose && (
                    <label className="block">
                      <span className="cs-label">{t("panels.closeDm")}</span>
                      <textarea className="cs-textarea" rows={3} value={form.dmOnCloseMessage}
                        onChange={(e) => setForm((f) => ({ ...f, dmOnCloseMessage: e.target.value }))}
                        placeholder={t("panels.ph.closeDm")} />
                    </label>
                  )}
                </div>
              </details>

              <details className="cs-card !p-4 !bg-cs-panel">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Automation {!isPremium && <PremiumBadge small />}</summary>
                <div className="pt-4 space-y-3">
                  <label className="block">
                    <span className="cs-label">{t("ui.inactivityAutoClose")}</span>
                    <input type="number" className="cs-input" min={1} value={form.inactivityCloseHours}
                      onChange={(e) => setForm((f) => ({ ...f, inactivityCloseHours: e.target.value }))}
                      placeholder={t("panels.ph.inactivity")} />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="cs-label">{t("ui.slaFirstResponse")}</span>
                      <input type="number" className="cs-input" min={1} max={20160} value={form.slaFirstResponseMinutes}
                        onChange={(e) => setForm((f) => ({ ...f, slaFirstResponseMinutes: e.target.value }))} />
                      <p className="text-xs text-cs-dim mt-1">{t("ui.slaFirstResponseHint")}</p>
                    </label>
                    <label className="block">
                      <span className="cs-label">{t("ui.slaResolution")}</span>
                      <input type="number" className="cs-input" min={1} max={20160} value={form.slaResolutionMinutes}
                        onChange={(e) => setForm((f) => ({ ...f, slaResolutionMinutes: e.target.value }))} />
                      <p className="text-xs text-cs-dim mt-1">{t("ui.slaResolutionHint")}</p>
                    </label>
                  </div>
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
                  <p className="text-xs text-cs-dim">{t("ui.hint.requireRoles")}</p>
                  <label className="block">
                    <span className="cs-label">{t("ui.requiredRolesAll")}</span>
                    <DiscordRoleSelect multi value={form.requireVerifiedRoleIds} onChange={(v) => setForm((f) => ({ ...f, requireVerifiedRoleIds: v }))} requireAssignable={false} />
                  </label>
                  <label className="block">
                    <span className="cs-label">{t("ui.customDeniedMsg")}</span>
                    <textarea className="cs-textarea" rows={3} value={form.verificationDeniedMessage}
                      onChange={(e) => setForm((f) => ({ ...f, verificationDeniedMessage: e.target.value }))}
                      placeholder={t("panels.ph.verifyGate")} />
                  </label>
                </div>
              </details>

              {/* Buttons */}
              <div>
                {/* Начинът на показване живее ТУК, до самите опции — беше
                    заровен в свитата секция „Categories & Channels", където
                    никой не го намираше. Той диктува и тавана: Discord дава 25
                    опции в падащо меню и 25 бутона (5 реда × 5). */}
                <label className="block mb-3">
                  <span className="cs-label">{t("panels.displayStyle")}</span>
                  <select className="cs-select" value={form.buttonStyle}
                    onChange={(e) => setForm((f) => ({ ...f, buttonStyle: e.target.value }))}>
                    <option value="BUTTON">{t("panels.style.buttons")}</option>
                    <option value="DROPDOWN">{t("panels.style.dropdown")}</option>
                    <option value="THREAD">{t("panels.style.threads")}</option>
                  </select>
                  <p className="text-xs text-cs-dim mt-1">
                    {form.buttonStyle === "DROPDOWN"
                      ? t("panels.style.dropdownHint")
                      : t("panels.style.buttonsHint")}
                  </p>
                </label>

                <div className="flex items-center justify-between mb-2">
                  <span className="cs-label">
                    {form.buttonStyle === "DROPDOWN" ? t("panels.options") : t("panels.buttonsLabel")} ({form.buttons.length}/{MAX_PANEL_BUTTONS})
                  </span>
                  <button type="button" onClick={addButton}
                    disabled={form.buttons.length >= MAX_PANEL_BUTTONS}
                    className="text-cs-cyan hover:text-cs-cyan text-sm transition-colors disabled:opacity-40">
                    {form.buttonStyle === "DROPDOWN" ? t("panels.addOption") : t("panels.addButton")}
                  </button>
                </div>
                <div className="space-y-2">
                  {form.buttons.map((btn, i) => (
                    <div key={i} className="bg-cs-bg rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 flex-wrap items-center">
                        <input className="cs-input w-16 py-1 text-sm" value={btn.emoji}
                          aria-label={`Button ${i + 1} emoji`}
                          onChange={(e) => updateButton(i, "emoji", e.target.value)}
                          placeholder={t("panels.ph.emoji")} />
                        <EmojiPicker
                          buttonLabel={t("emoji.pickForOption", { n: i + 1 })}
                          onSelect={(e) => updateButton(i, "emoji", e)}
                        />
                        <input className="cs-input flex-1 min-w-[100px] py-1 text-sm" value={btn.label}
                          aria-label={`Button ${i + 1} label`}
                          onChange={(e) => updateButton(i, "label", e.target.value)}
                          placeholder={t("panels.ph.buttonLabel")} required />
                        <select className="cs-input py-1 text-sm w-28" value={btn.style}
                          aria-label={`Button ${i + 1} style`}
                          onChange={(e) => updateButton(i, "style", e.target.value)}>
                          {BUTTON_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {form.buttons.length > 1 && (
                          <button type="button" onClick={() => removeButton(i)}
                            aria-label={`Remove button ${i + 1}`}
                            title={t("panels.removeButton")}
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
                            <optgroup label={t("panels.askFirst")}>
                              {forms.filter((f) => !f.isApplication).map((f) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {forms.filter((f) => f.isApplication).length > 0 && (
                            <optgroup label={t("panels.submitAsApp")}>
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
                  ❌ {mutError?.response?.data?.error || t("common.operationFailed")}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="cs-btn-ghost">Cancel</button>
                <button type="submit" className="cs-btn-primary" disabled={isPending}>
                  {isPending ? t("common.saving") : editing === "new" ? t("common.createPanel") : t("common.saveChanges")}
                </button>
              </div>
            </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        destructive
        confirmLabel={t("common.delete")}
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
