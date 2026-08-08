// frontend/src/pages/VerificationPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect } from "../components/DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Pencil, ShieldCheck } from "lucide-react";
import {
  getVerificationPanels, createVerificationPanel, updateVerificationPanel,
  deleteVerificationPanel, spawnVerificationPanel,
} from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import EmojiPicker from "../components/EmojiPicker";
import { useT } from "../contexts/I18nContext";

const TYPES = [
  { value: "BUTTON",   label: "One-click button",    hint: "User clicks a button → instantly verified" },
  { value: "MATH",     label: "Math captcha",        hint: "User solves a simple math problem in a modal" },
  { value: "REACTION", label: "Reaction (experimental)", hint: "User reacts to the message" },
];

const DIFFICULTIES = [
  { value: "EASY",   label: "Easy (1-digit)" },
  { value: "MEDIUM", label: "Medium (2-digit)" },
  { value: "HARD",   label: "Hard (multiplication)" },
];

const BUTTON_STYLES = [
  { value: "PRIMARY",   label: "Blue" },
  { value: "SECONDARY", label: "Grey" },
  { value: "SUCCESS",   label: "Green" },
  { value: "DANGER",    label: "Red" },
];

const defaultForm = () => ({
  name: "",
  title: "✅ Verify to access the server",
  description: "Click the button below to verify you're not a bot.",
  color: "#8fe600",
  type: "BUTTON",
  buttonLabel: "Verify",
  buttonEmoji: "",
  buttonStyle: "SUCCESS",
  successMessage: "",
  failureMessage: "",
  mathDifficulty: "EASY",
  grantRoleIds: "",
  removeRoleIds: "",
  minAccountAgeDays: "",
  logChannelId: "",
  dmOnSuccess: false,
  dmSuccessMessage: "",
  maxAttempts: 5,
  cooldownMinutes: 10,
});

function panelToForm(p) {
  return {
    ...defaultForm(),
    ...p,
    grantRoleIds: (p.grantRoleIds || []).join(","),
    removeRoleIds: (p.removeRoleIds || []).join(","),
    minAccountAgeDays: p.minAccountAgeDays ?? "",
    description: p.description || "",
    buttonEmoji: p.buttonEmoji || "",
    successMessage: p.successMessage || "",
    failureMessage: p.failureMessage || "",
    logChannelId: p.logChannelId || "",
    dmSuccessMessage: p.dmSuccessMessage || "",
  };
}

export default function VerificationPage() {
  const { serverId } = useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const { isPremium } = usePremium();
  const [editing, setEditing] = useState(null); // null | "new" | panelId
  const [form, setForm] = useState(defaultForm());
  const [spawnInputs, setSpawnInputs] = useState({});
  const [confirmState, setConfirmState] = useState(null);

  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["verification", serverId],
    queryFn: () => getVerificationPanels(serverId),
  });

  const createMut = useMutation({
    mutationFn: (data) => createVerificationPanel(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["verification", serverId] }); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ panelId, data }) => updateVerificationPanel(serverId, panelId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["verification", serverId] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (panelId) => deleteVerificationPanel(serverId, panelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verification", serverId] }),
  });
  const spawnMut = useMutation({
    mutationFn: ({ panelId, channelId }) => spawnVerificationPanel(serverId, panelId, channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verification", serverId] }),
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const openNew = () => { setForm(defaultForm()); setEditing("new"); };
  const openEdit = (p) => { setForm(panelToForm(p)); setEditing(p.id); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const csv = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
    const payload = {
      ...form,
      grantRoleIds: csv(form.grantRoleIds),
      removeRoleIds: csv(form.removeRoleIds),
      minAccountAgeDays: form.minAccountAgeDays === "" ? null : Number(form.minAccountAgeDays),
      maxAttempts: Number(form.maxAttempts) || 5,
      cooldownMinutes: Number(form.cooldownMinutes) || 10,
      buttonEmoji: form.buttonEmoji || undefined,
      description: form.description || null,
      successMessage: form.successMessage || null,
      failureMessage: form.failureMessage || null,
      logChannelId: form.logChannelId || null,
      dmSuccessMessage: form.dmSuccessMessage || null,
    };
    if (editing === "new") createMut.mutate(payload);
    else updateMut.mutate({ panelId: editing, data: payload });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-cs-cyan" /> Verification
          </h1>
          <p className="text-cs-muted mt-2 max-w-xl">
            Anti-bot gates for your server. Users verify once (button click or math captcha) to
            receive a role, then ticket panels can require that role before opening.
          </p>
        </div>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Panel
        </button>
      </div>

      {isLoading && <div className="cs-card h-32 animate-pulse" />}

      {!isLoading && panels.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title={t("nav.verification")}
          description={t("verify.empty.body")}
          ctaLabel={t("verify.empty.cta")}
          onCtaClick={openNew}
        />
      )}

      <div className="space-y-3">
        {panels.map((p) => (
          <div key={p.id} className="cs-card flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-cs-text font-bold">{p.name}</span>
                <span className="cs-badge text-cs-cyan">{p.type}</span>
                {p.channelId && (
                  <span className="cs-badge text-success">Spawned</span>
                )}
              </div>
              <div className="text-xs text-cs-dim mt-1">
                ✓ {p.successCount} verified · ✗ {p.failCount} failed · Grants {p.grantRoleIds?.length || 0} role(s)
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!p.channelId && (
                <>
                  <input
                    className="cs-input font-mono text-xs w-48"
                    placeholder={t("verify.channelPlaceholder")}
                    aria-label={t("verify.channelToPost")}
                    value={spawnInputs[p.id] || ""}
                    onChange={(e) => setSpawnInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                  />
                  <button
                    onClick={() => spawnInputs[p.id] && spawnMut.mutate({ panelId: p.id, channelId: spawnInputs[p.id] })}
                    disabled={!spawnInputs[p.id] || spawnMut.isPending}
                    className="cs-btn-secondary p-2 disabled:opacity-40"
                    aria-label={t("verify.postToChannel")}
                    title={t("verify.postToChannel")}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </>
              )}
              <button onClick={() => openEdit(p)} aria-label="Edit panel" title="Edit panel" className="text-cs-cyan hover:opacity-80 p-2">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmState({
                  title: t("verify.delete"),
                  message: `Delete "${p.name}"?`,
                  onConfirm: () => { deleteMut.mutate(p.id); setConfirmState(null); },
                })}
                aria-label={t("verify.delete")}
                title={t("verify.delete")}
                className="text-danger hover:text-red-300 p-2"
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
        title={editing === "new" ? t("verify.new") : t("verify.edit")}
        maxWidth="max-w-2xl"
      >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="cs-label">Name (internal)</span>
                <input className="cs-input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <label className="block">
                <span className="cs-label flex items-center gap-2">
                  Type
                </span>
                <select className="cs-select" value={form.type} onChange={(e) => set("type", e.target.value)}>
                  {TYPES.map((t) => (
                    <option
                      key={t.value}
                      value={t.value}
                      disabled={t.value === "MATH" && !isPremium}
                    >
                      {t.label}{t.value === "MATH" && !isPremium ? " (Premium)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-cs-dim mt-1">{TYPES.find((t) => t.value === form.type)?.hint}</p>
                {form.type === "MATH" && !isPremium && (
                  <p className="text-xs text-cs-gold mt-1 flex items-center gap-1">
                    <PremiumBadge small /> Math captcha requires Premium
                  </p>
                )}
              </label>
            </div>

            <label className="block">
              <span className="cs-label">Embed Title</span>
              <input className="cs-input" required value={form.title} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="block">
              <span className="cs-label">Embed Description</span>
              <textarea className="cs-textarea" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="cs-label">Color</span>
                <input type="color" className="cs-input h-10" value={form.color} onChange={(e) => set("color", e.target.value)} />
              </label>
              <label className="block">
                <span className="cs-label">Button Label</span>
                <input className="cs-input" value={form.buttonLabel} onChange={(e) => set("buttonLabel", e.target.value)} />
              </label>
              {/* buttonEmoji живееше в state-а и се пращаше към API-то, но нямаше
                  НИКАКЪВ вход — полето беше недостижимо от дашборда. */}
              <label className="block">
                <span className="cs-label">{t("verify.buttonEmoji")}</span>
                <div className="flex items-center gap-2">
                  <input className="cs-input w-24" value={form.buttonEmoji}
                    onChange={(e) => set("buttonEmoji", e.target.value)}
                    placeholder={t("panels.ph.emoji")} />
                  <EmojiPicker
                    buttonLabel={t("emoji.pickForButton")}
                    onSelect={(e) => set("buttonEmoji", e)}
                  />
                </div>
              </label>
              <label className="block">
                <span className="cs-label">Button Style</span>
                <select className="cs-select" value={form.buttonStyle} onChange={(e) => set("buttonStyle", e.target.value)}>
                  {BUTTON_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {form.type === "MATH" && (
              <label className="block">
                <span className="cs-label">Math Difficulty</span>
                <select className="cs-select" value={form.mathDifficulty} onChange={(e) => set("mathDifficulty", e.target.value)}>
                  {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="cs-label">Roles granted on verification</span>
                <DiscordRoleSelect multi value={form.grantRoleIds} onChange={(v) => set("grantRoleIds", v)} />
              </label>
              <label className="block">
                <span className="cs-label">Roles to remove</span>
                <DiscordRoleSelect multi value={form.removeRoleIds} onChange={(v) => set("removeRoleIds", v)} requireAssignable={false} />
              </label>
            </div>

            <label className="block">
              <span className="cs-label">Success Message</span>
              <textarea className="cs-textarea" rows={2} value={form.successMessage} onChange={(e) => set("successMessage", e.target.value)} placeholder="✅ Welcome! You can now access the server." />
            </label>
            <label className="block">
              <span className="cs-label">Failure Message (MATH only)</span>
              <textarea className="cs-textarea" rows={2} value={form.failureMessage} onChange={(e) => set("failureMessage", e.target.value)} placeholder="❌ Wrong answer. Try again." />
            </label>

            <details className="cs-card !p-3 !bg-cs-panel">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan">→ Anti-Bot & Limits</summary>
              <div className="pt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="cs-label flex items-center gap-1.5">
                      Min Account Age (days) {!isPremium && <PremiumBadge small />}
                    </span>
                    <input
                      type="number" min={0} className="cs-input disabled:opacity-50 disabled:cursor-not-allowed"
                      value={isPremium ? form.minAccountAgeDays : ""}
                      disabled={!isPremium}
                      onChange={(e) => set("minAccountAgeDays", e.target.value)}
                      placeholder={isPremium ? t("verify.noCheck") : t("verify.premiumOnly")}
                    />
                  </label>
                  <label className="block">
                    <span className="cs-label">Max Attempts</span>
                    <input type="number" min={1} max={100} className="cs-input" value={form.maxAttempts} onChange={(e) => set("maxAttempts", e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="cs-label">Cooldown (minutes)</span>
                    <input type="number" min={1} className="cs-input" value={form.cooldownMinutes} onChange={(e) => set("cooldownMinutes", e.target.value)} />
                  </label>
                </div>
                <label className="block">
                  <span className="cs-label">Log Channel</span>
                  <DiscordChannelSelect kind="text" value={form.logChannelId} onChange={(v) => set("logChannelId", v)} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.dmOnSuccess} onChange={(e) => set("dmOnSuccess", e.target.checked)} className="accent-cs-cyan" />
                  <span className="text-sm text-cs-text">DM user on successful verification</span>
                </label>
                {form.dmOnSuccess && (
                  <label className="block">
                    <span className="cs-label">DM Message</span>
                    <textarea className="cs-textarea" rows={2} value={form.dmSuccessMessage} onChange={(e) => set("dmSuccessMessage", e.target.value)} />
                  </label>
                )}
              </div>
            </details>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="cs-btn-secondary">Cancel</button>
              <button type="submit" className="cs-btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                {editing === "new" ? t("common.createPanel") : t("common.saveChanges")}
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
