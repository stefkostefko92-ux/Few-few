// frontend/src/components/automation/ReactionRolesTab.jsx
// Роли с реакция — раздел на страницата „Посрещане и роли“.
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect, ChannelName } from "../DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, SmilePlus, Pencil, Send } from "lucide-react";
import { getReactionRoles, createReactionRole, updateReactionRole, deleteReactionRole, spawnReactionRole } from "../../api";
import Modal from "../Modal";
import ConfirmDialog from "../ConfirmDialog";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import EmojiPicker from "../EmojiPicker";
import { Empty, ErrorCard } from "./shared";

const defaultRrmPair = () => ({ emoji: "", roleId: "", label: "" });
const defaultRrmForm = () => ({
  title: "",
  description: "",
  color: "#5865F2",
  exclusive: false,
  pairs: [defaultRrmPair()],
});

export default function ReactionRolesTab() {
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
          {t("auto.rr.intro")}
        </p>
        <button
          onClick={() => { setForm(defaultRrmForm()); setEditing("new"); setActionError(null); }}
          className="cs-btn-primary flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> {t("auto.rr.new")}
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
                  {m.exclusive && <span className="cs-badge text-cs-cyan">{t("auto.rr.exclusive")}</span>}
                  {m.messageId
                    ? <span className="cs-badge text-success">{t("auto.rr.live")}</span>
                    : <span className="cs-badge text-cs-dim">{t("auto.rr.notPosted")}</span>}
                </div>
                <p className="text-xs text-cs-muted mt-1">
                  {t("auto.rr.rolesCount", { n: m.pairs.length })}
                  {m.channelId && <> · <ChannelName id={m.channelId} /></>}
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
                    <Send className="w-3 h-3" /> {m.messageId ? t("common.repost") : t("common.postToChannel")}
                  </button>
                </div>
                <button
                  aria-label={t("auto.rr.edit")}
                  title={t("common.edit")}
                  className="text-cs-muted hover:text-white transition-colors p-1"
                  onClick={() => openEdit(m)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  aria-label={t("auto.rr.delete")}
                  title={t("common.delete")}
                  className="text-danger hover:text-red-300 transition-colors p-1"
                  onClick={() => setConfirmState({
                    title: t("auto.rr.delete"),
                    message: t("auto.rr.deleteConfirm", { name: m.title }),
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
        title={editing === "new" ? t("auto.rr.newTitle") : t("auto.rr.edit")}
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
            <span className="text-sm text-cs-text">{t("auto.rr.exclusiveHint")}</span>
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-cs-text">{t("auto.rr.pairs", { n: form.pairs.length })}</h3>
              <button type="button" disabled={form.pairs.length >= 20}
                onClick={() => setForm((f) => ({ ...f, pairs: [...f.pairs, defaultRrmPair()] }))}
                className="text-cs-cyan text-sm flex items-center gap-1 disabled:opacity-40">
                <Plus className="w-3 h-3" /> {t("auto.rr.addPair")}
              </button>
            </div>
            <div className="space-y-2">
              {form.pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-[70px_34px_1fr_1fr_28px] gap-2 items-center">
                  <input className="cs-input text-center" placeholder="🎮" aria-label={t("auto.rr.emojiFor", { n: i + 1 })}
                    value={p.emoji} onChange={(e) => updatePair(i, "emoji", e.target.value)} />
                  <EmojiPicker buttonLabel={t("emoji.pickForPair", { n: i + 1 })} onSelect={(e) => updatePair(i, "emoji", e)} />
                  <DiscordRoleSelect value={p.roleId} onChange={(v) => updatePair(i, "roleId", v)} />
                  <input className="cs-input text-xs" placeholder={t("ui.labelOpt")} aria-label={t("auto.rr.labelFor", { n: i + 1 })}
                    value={p.label} onChange={(e) => updatePair(i, "label", e.target.value)} />
                  <button type="button" aria-label={t("auto.rr.removePair", { n: i + 1 })}
                    disabled={form.pairs.length <= 1}
                    onClick={() => setForm((f) => ({ ...f, pairs: f.pairs.filter((_, idx) => idx !== i) }))}
                    className="text-danger hover:text-red-300 disabled:opacity-30 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-cs-dim mt-2">{t("ui.hint.emojiCustom")}<code>name:id</code>.{" "}
              {t("auto.rr.roleIdHint")}
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="cs-btn-ghost">{t("common.cancel")}</button>
            <button type="submit" className="cs-btn-primary" disabled={createM.isPending || updateM.isPending}>
              {(createM.isPending || updateM.isPending) ? t("common.saving") : editing === "new" ? t("common.create") : t("common.saveChanges")}
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
        confirmLabel={t("common.delete")}
        loading={deleteM.isPending}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
