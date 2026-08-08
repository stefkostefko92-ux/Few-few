// frontend/src/pages/FormsPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect } from "../components/DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GitBranch, ChevronDown, ChevronUp, Pencil, FileText, Send } from "lucide-react";
import { getForms, createForm, updateForm, deleteForm, spawnForm } from "../api";
import { usePremium } from "../hooks/usePremium";
import { PremiumBadge } from "../components/PremiumBadge";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

// value → преводен ключ; label се резолвва при рендиране (t() е hook, живее
// в компонента, не на модулно ниво).
const QUESTION_TYPES = [
  { value: "SHORT_TEXT", key: "forms.qType.short" },
  { value: "PARAGRAPH", key: "forms.qType.paragraph" },
  { value: "SELECT", key: "forms.qType.single" },
  { value: "MULTI_SELECT", key: "forms.qType.multi" },
  { value: "NUMBER", key: "forms.qType.number" },
];

const defaultQuestion = () => ({
  label: "",
  placeholder: "",
  type: "SHORT_TEXT",
  required: true,
  minLength: "",
  maxLength: "",
  choices: [],
  branches: {},
  _choicesText: "",
});

function formToState(f) {
  return {
    name: f.name,
    description: f.description || "",
    isApplication: f.isApplication,
    reviewChannelId: f.reviewChannelId || "",
    transcriptChannelId: f.transcriptChannelId || "",
    discussCategoryId: f.discussCategoryId || "",
    // Appy.bot-style fields
    acceptRoleIds:  (f.acceptRoleIds || []).join(","),
    denyRoleIds:    (f.denyRoleIds || []).join(","),
    removeRoleIds:  (f.removeRoleIds || []).join(","),
    managerRoleIds: (f.managerRoleIds || []).join(","),
    pingRoleIds:    (f.pingRoleIds || []).join(","),
    acceptMessage:  f.acceptMessage || "",
    denyMessage:    f.denyMessage || "",
    cooldownSeconds: f.cooldownSeconds || 0,
    maxSubmissions:  f.maxSubmissions || "",
    closed:          !!f.closedAt,
    questions: f.questions.map((q) => ({
      label: q.label,
      placeholder: q.placeholder || "",
      type: q.type,
      required: q.required,
      minLength: q.minLength || "",
      maxLength: q.maxLength || "",
      choices: q.choices || [],
      branches: q.branches || {},
      validationRegex: q.validationRegex || "",
      validationMessage: q.validationMessage || "",
      _choicesText: (q.choices || []).join("\n"),
    })),
  };
}

const defaultForm = () => ({
  name: "",
  description: "",
  isApplication: false,
  reviewChannelId: "",
  transcriptChannelId: "",
  discussCategoryId: "",
  acceptRoleIds:  "",
  denyRoleIds:    "",
  removeRoleIds:  "",
  managerRoleIds: "",
  pingRoleIds:    "",
  acceptMessage:  "",
  denyMessage:    "",
  cooldownSeconds: 0,
  maxSubmissions:  "",
  closed:          false,
  questions: [defaultQuestion()],
});

export default function FormsPage() {
  const { serverId } = useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const { isPremium } = usePremium();
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState(null); // formId being edited
  const [form, setForm] = useState(defaultForm());
  const [expandedQ, setExpandedQ] = useState(0);
  const [confirmState, setConfirmState] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [spawnInputs, setSpawnInputs] = useState({}); // formId → channelId

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms", serverId],
    queryFn: () => getForms(serverId),
  });

  const toast = useToast();

  const createMut = useMutation({
    mutationFn: (data) => createForm(serverId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", serverId] });
      setEditing(false);
      setEditingId(null);
      toast.success(t("forms.created"));
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("forms.createFailed")),
  });

  const updateMut = useMutation({
    mutationFn: ({ formId, data }) => updateForm(serverId, formId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", serverId] });
      setEditing(false);
      setEditingId(null);
      toast.success(t("common.saved"));
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("forms.updateFailed")),
  });

  const deleteMut = useMutation({
    mutationFn: ({ formId, force }) => deleteForm(serverId, formId, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", serverId] });
      toast.success(t("forms.deleted"));
    },
  });

  const spawnMut = useMutation({
    mutationFn: ({ formId, channelId }) => spawnForm(serverId, formId, channelId),
    onSuccess: (_data, { formId }) => {
      setSpawnInputs((s) => ({ ...s, [formId]: "" }));
      toast.success(t("forms.posted"));
    },
    onError: (err) => toast.error(err?.response?.data?.error || t("forms.postFailed")),
  });

  // Step 2 of cascade delete: form has applications, confirm force-delete.
  const askCascadeDelete = (form, count) => {
    setConfirmState({
      title: t("forms.hasSubmissions"),
      message:
        `This form has ${count} application submission${count === 1 ? "" : "s"}.\n\n` +
        `Deleting will remove the form AND all ${count} submissions.\n` +
        `Cancel to keep everything.`,
      confirmLabel: t("common.deleteEverything"),
      onConfirm: async () => {
        setActionError(null);
        try {
          await deleteMut.mutateAsync({ formId: form.id, force: true });
          setConfirmState(null);
        } catch (e) {
          setConfirmState(null);
          setActionError(`Delete failed: ${e?.response?.data?.error || e.message}`);
        }
      },
    });
  };

  // Step 1: confirm delete; on FORM_HAS_APPLICATIONS, escalate to cascade confirm.
  const handleDelete = (form) => {
    setActionError(null);
    setConfirmState({
      title: t("forms.delete"),
      message: `Delete form "${form.name}"?`,
      confirmLabel: t("common.delete"),
      onConfirm: async () => {
        try {
          await deleteMut.mutateAsync({ formId: form.id, force: false });
          setConfirmState(null);
        } catch (err) {
          const data = err?.response?.data;
          if (data?.code === "FORM_HAS_APPLICATIONS") {
            askCascadeDelete(form, data.applicationCount);
          } else {
            setConfirmState(null);
            setActionError(`Delete failed: ${data?.error || err.message}`);
          }
        }
      },
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const csvToArray = (s) => (s || "").split(",").map(x => x.trim()).filter(Boolean);
    const payload = {
      ...form,
      acceptRoleIds:  csvToArray(form.acceptRoleIds),
      denyRoleIds:    csvToArray(form.denyRoleIds),
      removeRoleIds:  csvToArray(form.removeRoleIds),
      managerRoleIds: csvToArray(form.managerRoleIds),
      pingRoleIds:    csvToArray(form.pingRoleIds),
      acceptMessage:  form.acceptMessage || null,
      denyMessage:    form.denyMessage || null,
      cooldownSeconds: Number(form.cooldownSeconds) || 0,
      maxSubmissions:  form.maxSubmissions ? Number(form.maxSubmissions) : null,
      closed:          !!form.closed,
      questions: form.questions.map(({ _choicesText, choices: _c, ...q }) => ({
        ...q,
        minLength: q.minLength ? Number(q.minLength) : undefined,
        maxLength: q.maxLength ? Number(q.maxLength) : undefined,
        choices: _choicesText ? _choicesText.split("\n").map((c) => c.trim()).filter(Boolean) : [],
        branches: q.branches || {},
        validationRegex:   q.validationRegex   || null,
        validationMessage: q.validationMessage || null,
      })),
    };
    if (editingId) {
      updateMut.mutate({ formId: editingId, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const addQuestion = () => {
    setForm((f) => ({ ...f, questions: [...f.questions, defaultQuestion()] }));
    setExpandedQ(form.questions.length);
  };

  const removeQuestion = (i) => {
    setForm((f) => ({ ...f, questions: f.questions.filter((_, idx) => idx !== i) }));
  };

  const updateQuestion = (i, key, val) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, idx) => idx === i ? { ...q, [key]: val } : q),
    }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-cs-text">Forms</h1>
          <p className="text-cs-muted text-sm mt-1">Build logic-branching questionnaires for tickets and applications</p>
        </div>
        <button onClick={() => { setForm(defaultForm()); setEditing(true); }} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Form
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="cs-card h-20 animate-pulse bg-cs-panel" />)}</div>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("forms.empty.title")}
          description={t("forms.empty.body")}
          ctaLabel={t("forms.empty.cta")}
          onCtaClick={() => { setForm(defaultForm()); setEditing(true); }}
        />
      ) : (
        <div className="space-y-4">
          {forms.map((f) => (
            <div key={f.id} className="cs-card">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-cs-text">{f.name}</h3>
                    <span className={f.isApplication ? "cs-badge-premium" : "cs-badge-muted"}>
                      {f.isApplication ? "Application" : "Ticket Form"}
                    </span>
                  </div>
                  <p className="text-sm text-cs-muted mt-0.5">{f.questions.length} questions</p>
                  {f.description && <p className="text-xs text-cs-muted mt-1">{f.description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Spawn input — постът отива в канала с това ID (като при панелите) */}
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-[11rem] sm:flex-none sm:w-44">
                      <DiscordChannelSelect kind="text" value={spawnInputs[f.id] || ""}
                        onChange={(v) => setSpawnInputs((s) => ({ ...s, [f.id]: v }))} />
                    </div>
                    <button
                      className="cs-btn-primary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                      disabled={!spawnInputs[f.id] || spawnMut.isPending}
                      onClick={() => spawnMut.mutate({ formId: f.id, channelId: spawnInputs[f.id].trim() })}
                    >
                      <Send className="w-3 h-3" /> Post to channel
                    </button>
                  </div>
                  <button
                    aria-label={t("forms.edit")}
                    title={t("forms.edit")}
                    className="text-cs-muted hover:text-white transition-colors p-1"
                    onClick={() => { setEditingId(f.id); setForm(formToState(f)); setEditing(true); }}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    aria-label={t("forms.delete")}
                    title={t("forms.delete")}
                    className="text-danger hover:text-red-300 transition-colors p-1 flex-shrink-0"
                    onClick={() => handleDelete(f)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Questions preview */}
              <div className="mt-3 flex flex-wrap gap-1">
                {f.questions.map((q, i) => (
                  <span key={q.id} className="bg-cs-bg text-cs-text text-xs px-2 py-0.5 rounded">
                    {i + 1}. {q.label.slice(0, 30)}{q.label.length > 30 ? "..." : ""}
                    {Object.keys(q.branches || {}).length > 0 && (
                      <GitBranch className="w-3 h-3 inline ml-1 text-cs-cyan" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteMut.isError && (
        <div className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500/30 text-danger text-sm px-4 py-3 rounded-lg z-50">
          ❌ {deleteMut.error?.response?.data?.error || "Failed to delete form"}
        </div>
      )}

      {/* Create Form Modal */}
      <Modal
        open={editing}
        onClose={() => { setEditing(false); setEditingId(null); }}
        title={editingId ? "Edit form" : "New form"}
        maxWidth="max-w-3xl"
      >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic info */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="cs-label">{t("ui.formNameReq")}</span>
                    <input className="cs-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("forms.ph.staffApp")} />
                  </label>
                  <label className="block">
                    <span className="cs-label">{t("ui.type")}</span>
                    <select className="cs-input" value={String(form.isApplication)} onChange={(e) => setForm((f) => ({ ...f, isApplication: e.target.value === "true" }))}>
                      <option value="false">{t("forms.type.ticket")}</option>
                      <option value="true">{t("forms.type.application")}</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="cs-label">{t("common.description")}</span>
                  <input className="cs-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("forms.ph.shortDesc")} />
                </label>
                {form.isApplication && (
                  <label className="block">
                    <span className="cs-label">{t("forms.reviewChannel")}</span>
                    <DiscordChannelSelect
                      kind="text"
                      value={form.reviewChannelId}
                      onChange={(v) => setForm((f) => ({ ...f, reviewChannelId: v }))}
                    />
                  </label>
                )}

                {/* Категорията, в която пада „Open a ticket“ от ревюто. Беше поле за
                    19 цифри — тоест функцията изглеждаше липсваща, защото никой не
                    минава през Developer Mode, за да я намери. (08.08.2026) */}
                {form.isApplication && (
                  <label className="block">
                    <span className="cs-label">{t("forms.discussCategory")}</span>
                    <DiscordChannelSelect
                      kind="category"
                      value={form.discussCategoryId}
                      onChange={(v) => setForm((f) => ({ ...f, discussCategoryId: v }))}
                      emptyLabel={t("picker.autoPick")}
                    />
                    <p className="text-xs text-cs-dim mt-1">{t("forms.discussCategoryHint")}</p>
                  </label>
                )}

                <label className="block">
                  <span className="cs-label">{t("forms.transcriptChannel")}</span>
                  <DiscordChannelSelect
                    kind="text"
                    value={form.transcriptChannelId}
                    onChange={(v) => setForm((f) => ({ ...f, transcriptChannelId: v }))}
                  />
                  <p className="text-xs text-cs-dim mt-1">{t("ui.hint.transcriptOff")}</p>
                </label>

                {/* ─── Appy.bot-style fields (application forms only) ─── */}
                {form.isApplication && (
                  <details className="cs-card !p-4 !bg-cs-panel">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-cs-cyan select-none flex items-center gap-2">
                      → Advanced: Roles, Messages, Cooldowns
                      {!isPremium && <PremiumBadge small />}
                    </summary>
                    <div className="pt-4 space-y-3">
                      {!isPremium && (
                        <div className="cs-card !p-3 !bg-cs-gold/5 border-cs-gold/30 text-xs text-cs-gold">
                          <strong>Premium required</strong> — these advanced features (auto-role on accept/deny, custom DM messages, cooldowns) need a Premium subscription.
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="cs-label">{t("ui.acceptAddRoles")}</span>
                          <DiscordRoleSelect multi value={form.acceptRoleIds} onChange={(v) => setForm((f) => ({ ...f, acceptRoleIds: v }))} />
                        </label>
                        <label className="block">
                          <span className="cs-label">{t("ui.acceptRemoveRoles")}</span>
                          <DiscordRoleSelect multi value={form.removeRoleIds} onChange={(v) => setForm((f) => ({ ...f, removeRoleIds: v }))} requireAssignable={false} />
                        </label>
                      </div>
                      <label className="block">
                        <span className="cs-label">{t("ui.denyAddRoles")}</span>
                        <DiscordRoleSelect multi value={form.denyRoleIds} onChange={(v) => setForm((f) => ({ ...f, denyRoleIds: v }))} />
                      </label>
                      <label className="block">
                        <span className="cs-label">{t("ui.appManagers")}</span>
                        <DiscordRoleSelect multi value={form.managerRoleIds} onChange={(v) => setForm((f) => ({ ...f, managerRoleIds: v }))} requireAssignable={false} />
                      </label>
                      <label className="block">
                        <span className="cs-label">{t("ui.pingRolesOnSubmit")}</span>
                        <DiscordRoleSelect multi value={form.pingRoleIds} onChange={(v) => setForm((f) => ({ ...f, pingRoleIds: v }))} requireAssignable={false} />
                      </label>
                      <label className="block">
                        <span className="cs-label">Accept DM message (markdown; {"{user}"}, {"{note}"})</span>
                        <textarea className="cs-textarea" rows={3} value={form.acceptMessage} onChange={(e) => setForm((f) => ({ ...f, acceptMessage: e.target.value }))} placeholder={t("ui.ph.acceptDm")} />
                      </label>
                      <label className="block">
                        <span className="cs-label">{t("ui.denyDmMessage")}</span>
                        <textarea className="cs-textarea" rows={3} value={form.denyMessage} onChange={(e) => setForm((f) => ({ ...f, denyMessage: e.target.value }))} placeholder={t("ui.ph.denyDm")} />
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="cs-label">{t("ui.cooldownSec")}</span>
                          <input className="cs-input" type="number" min="0" value={form.cooldownSeconds} onChange={(e) => setForm((f) => ({ ...f, cooldownSeconds: e.target.value }))} placeholder={t("ui.zeroNone")} />
                        </label>
                        <label className="block">
                          <span className="cs-label">{t("ui.maxSubmissions")}</span>
                          <input className="cs-input" type="number" min="0" value={form.maxSubmissions} onChange={(e) => setForm((f) => ({ ...f, maxSubmissions: e.target.value }))} placeholder={t("forms.ph.maxSub")} />
                        </label>
                        <label className="flex items-center gap-2 mt-6">
                          <input type="checkbox" checked={form.closed} onChange={(e) => setForm((f) => ({ ...f, closed: e.target.checked }))} className="accent-cs-cyan" />
                          <span className="text-sm text-cs-muted">Applications closed</span>
                        </label>
                      </div>
                    </div>
                  </details>
                )}
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-cs-text">Questions ({form.questions.length})</h3>
                  <button type="button" onClick={addQuestion} className="text-cs-cyan hover:text-cs-cyan text-sm transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Question
                  </button>
                </div>

                <div className="space-y-3">
                  {form.questions.map((q, i) => (
                    <div key={i} className="bg-cs-bg rounded-lg border border-white/5">
                      {/* Question header */}
                      <div className="flex items-center justify-between p-3">
                        <button
                          type="button"
                          aria-expanded={expandedQ === i}
                          onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <span className="w-6 h-6 rounded bg-cs-cyan/20 text-cs-cyan text-xs flex items-center justify-center font-bold">{i + 1}</span>
                          <span className="text-sm text-cs-text">{q.label || "Untitled Question"}</span>
                          <span className="text-xs text-cs-muted">{q.type}</span>
                          {Object.keys(q.branches || {}).length > 0 && (
                            <GitBranch className="w-3 h-3 text-cs-cyan" />
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          {form.questions.length > 1 && (
                            <button type="button" aria-label={`Remove question ${i + 1}`} title={t("forms.removeQuestion")} onClick={(e) => { e.stopPropagation(); removeQuestion(i); }} className="text-danger hover:text-red-300 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {expandedQ === i ? <ChevronUp className="w-4 h-4 text-cs-muted" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-cs-muted" aria-hidden="true" />}
                        </div>
                      </div>

                      {expandedQ === i && (
                        <div className="px-3 pb-3 border-t border-white/5 pt-3 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="block">
                              <span className="cs-label text-xs">Question Label *</span>
                              <input className="cs-input py-1.5 text-sm" required value={q.label} onChange={(e) => updateQuestion(i, "label", e.target.value)} placeholder={t("forms.ph.question")} />
                            </label>
                            <label className="block">
                              <span className="cs-label text-xs">Type</span>
                              <select className="cs-input py-1.5 text-sm" value={q.type} onChange={(e) => updateQuestion(i, "type", e.target.value)}>
                                {QUESTION_TYPES.map((qt) => <option key={qt.value} value={qt.value}>{t(qt.key)}</option>)}
                              </select>
                            </label>
                          </div>

                          <label className="block">
                            <span className="cs-label text-xs">Placeholder</span>
                            <input className="cs-input py-1.5 text-sm" value={q.placeholder} onChange={(e) => updateQuestion(i, "placeholder", e.target.value)} placeholder={t("forms.ph.hint")} />
                          </label>

                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm text-cs-text cursor-pointer">
                              <input type="checkbox" className="rounded" checked={q.required} onChange={(e) => updateQuestion(i, "required", e.target.checked)} />
                              Required
                            </label>
                            <label className="block flex-1">
                              <span className="cs-label text-xs">{t("forms.minLength")}</span>
                              <input type="number" className="cs-input py-1 text-sm" value={q.minLength} onChange={(e) => updateQuestion(i, "minLength", e.target.value)} placeholder="0" />
                            </label>
                            <label className="block flex-1">
                              <span className="cs-label text-xs">{t("forms.maxLength")}</span>
                              <input type="number" className="cs-input py-1 text-sm" value={q.maxLength} onChange={(e) => updateQuestion(i, "maxLength", e.target.value)} placeholder="1000" />
                            </label>
                          </div>

                          {(q.type === "SELECT" || q.type === "MULTI_SELECT") && (
                            <label className="block">
                              <span className="cs-label text-xs flex items-center gap-1">
                                <GitBranch className="w-3 h-3 text-cs-cyan" /> Choices (one per line — supports logic branching)
                              </span>
                              <textarea className="cs-input text-sm" rows={4} value={q._choicesText} onChange={(e) => updateQuestion(i, "_choicesText", e.target.value)} placeholder={"Yes\nNo\nMaybe"} />
                              <p className="text-xs text-cs-muted mt-1">Add choices above. Logic branching (jump to a different question based on choice) can be configured after form creation.</p>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setEditing(false); setEditingId(null); }} className="cs-btn-ghost">Cancel</button>
                <button type="submit" className="cs-btn-primary" disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? "Saving…" : editingId ? "Save Changes" : "Create Form"}
                </button>
              </div>

              {(createMut.isError || updateMut.isError) && (
                <p className="text-danger text-sm" role="alert">{(createMut.error || updateMut.error)?.response?.data?.error || "Operation failed"}</p>
              )}
            </form>
      </Modal>

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 bg-red-500/20 border border-red-500/30 text-danger text-sm px-4 py-3 rounded-lg z-50 flex items-center gap-3"
        >
          <span>❌ {actionError}</span>
          <button
            type="button"
            aria-label={t("forms.dismissError")}
            title="Dismiss"
            onClick={() => setActionError(null)}
            className="text-red-300 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        destructive
        confirmLabel={confirmState?.confirmLabel || "Delete"}
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm(); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
