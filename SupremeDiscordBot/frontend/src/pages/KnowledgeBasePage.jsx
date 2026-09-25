// frontend/src/pages/KnowledgeBasePage.jsx
// v32 — Knowledge Base dashboard CRUD. Staff write short articles with
// keywords; the bot suggests the best match on new tickets (see
// bot/src/events/interactionCreate.js → suggestAndPostKbArticle).
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Lightbulb, CheckCircle2, XCircle, X as XIcon } from "lucide-react";
import {
  getKbArticles, createKbArticle, updateKbArticle, toggleKbArticle, deleteKbArticle,
} from "../api";
import { useToast } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";

const TITLE_MAX = 120;
const CONTENT_MAX = 4000;
const KEYWORDS_MAX = 10;

const defaultForm = () => ({ title: "", content: "", keywords: [], enabled: true });

export default function KnowledgeBasePage() {
  const { t } = useT();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(defaultForm());
  const [keywordDraft, setKeywordDraft] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [formError, setFormError] = useState(null);

  const { data: articles = [], isLoading, isError } = useQuery({
    queryKey: ["kb", serverId],
    queryFn: () => getKbArticles(serverId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["kb", serverId] });

  const createMut = useMutation({
    mutationFn: (data) => createKbArticle(serverId, data),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Article created."); },
    onError: (err) => setFormError(err?.response?.data?.error || t("kb.createFailed")),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateKbArticle(serverId, id, data),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Article updated."); },
    onError: (err) => setFormError(err?.response?.data?.error || t("kb.updateFailed")),
  });
  const toggleMut = useMutation({
    mutationFn: (id) => toggleKbArticle(serverId, id),
    onSuccess: invalidate,
    onError: (err) => toast.error(err?.response?.data?.error || t("kb.toggleFailed")),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteKbArticle(serverId, id),
    onSuccess: () => { invalidate(); toast.success("Article deleted."); },
    onError: (err) => toast.error(err?.response?.data?.error || t("kb.deleteFailed")),
  });

  const openNew = () => { setForm(defaultForm()); setKeywordDraft(""); setFormError(null); setEditing("new"); };
  const openEdit = (a) => {
    setForm({ title: a.title, content: a.content, keywords: a.keywords || [], enabled: a.enabled });
    setKeywordDraft("");
    setFormError(null);
    setEditing(a.id);
  };

  const addKeyword = () => {
    const kw = keywordDraft.trim().toLowerCase();
    if (!kw) return;
    if (form.keywords.length >= KEYWORDS_MAX) return;
    if (form.keywords.includes(kw)) { setKeywordDraft(""); return; }
    setForm((f) => ({ ...f, keywords: [...f.keywords, kw] }));
    setKeywordDraft("");
  };
  const removeKeyword = (kw) => {
    setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== kw) }));
  };
  const onKeywordKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim() || !form.content.trim()) {
      setFormError(t("kb.needTitleContent"));
      return;
    }
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      keywords: form.keywords,
      enabled: form.enabled,
    };
    if (editing === "new") createMut.mutate(payload);
    else updateMut.mutate({ id: editing, data: payload });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
            <Lightbulb className="w-7 h-7 text-cs-cyan" /> Knowledge Base
          </h1>
          <p className="text-cs-muted mt-2 max-w-2xl">
            Write short articles with keywords. When a member opens a ticket, Supreme Bot
            automatically suggests the best-matching article in the ticket channel — often
            resolving the question before staff even join.
          </p>
        </div>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {isLoading && <div className="cs-card h-32 animate-pulse" />}

      {!isLoading && isError && (
        <div role="alert" className="cs-card text-center py-12 text-danger">
          Couldn't load articles — please retry.
        </div>
      )}

      {!isLoading && !isError && articles.length === 0 && (
        <EmptyState
          icon={Lightbulb}
          title={t("kb.empty.title")}
          description={t("kb.empty.body")}
          ctaLabel={t("kb.empty.cta")}
          onCtaClick={openNew}
        />
      )}

      <div className="space-y-3">
        {articles.map((a) => (
          <div key={a.id} className="cs-card flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-cs-text font-bold truncate">{a.title}</span>
                {a.enabled
                  ? <span className="cs-badge text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Enabled</span>
                  : <span className="cs-badge text-danger flex items-center gap-1"><XCircle className="w-3 h-3" /> Disabled</span>}
              </div>
              <div className="text-xs text-cs-dim font-mono truncate">
                {(a.keywords || []).map((k) => `#${k}`).join(" ") || "(no keywords)"}
              </div>
              <div className="text-xs text-cs-dim mt-1">
                Suggested {a.usageCount}× · 👍 {a.helpfulCount} · 👎 {a.notHelpfulCount}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => toggleMut.mutate(a.id)}
                aria-label={a.enabled ? `Disable article ${a.title}` : `Enable article ${a.title}`}
                title={a.enabled ? "Disable" : "Enable"}
                className="text-cs-dim hover:text-cs-cyan p-2"
              >
                {a.enabled ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </button>
              <button onClick={() => openEdit(a)} aria-label={`Edit article ${a.title}`} title={t("kb.edit")} className="text-cs-cyan hover:opacity-80 p-2">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmState({
                  title: "Delete Article",
                  message: `Delete "${a.title}"? This cannot be undone.`,
                  onConfirm: () => deleteMut.mutate(a.id),
                })}
                aria-label={`Delete article ${a.title}`}
                title={t("kb.delete")}
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
        title={editing === "new" ? t("kb.new") : t("kb.edit")}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="cs-label">{t("ui.title")}</span>
            <input className="cs-input" required maxLength={TITLE_MAX} value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("kb.ph.title")} />
          </label>

          <label className="block">
            <span className="cs-label">{t("ui.content")}</span>
            <textarea className="cs-input min-h-[140px]" required maxLength={CONTENT_MAX} value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder={t("kb.ph.content")} />
            <p className="text-xs text-cs-dim mt-1">{form.content.length} / {CONTENT_MAX}</p>
          </label>

          <div className="block">
            <span className="cs-label">Keywords (up to {KEYWORDS_MAX})</span>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {form.keywords.map((kw) => (
                <span key={kw} className="cs-badge flex items-center gap-1">
                  {kw}
                  <button type="button" onClick={() => removeKeyword(kw)} aria-label={`Remove keyword ${kw}`} className="hover:text-danger">
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              className="cs-input"
              value={keywordDraft}
              disabled={form.keywords.length >= KEYWORDS_MAX}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={onKeywordKeyDown}
              onBlur={addKeyword}
              placeholder={t("kb.ph.keyword")}
            />
            <p className="text-xs text-cs-dim mt-1">{t("ui.hint.kbMatch")}</p>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">Enabled</span>
          </label>

          {formError && (
            <p role="alert" className="text-danger text-sm">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="cs-btn-secondary">Cancel</button>
            <button type="submit" className="cs-btn-primary" disabled={createMut.isPending || updateMut.isPending}>
              {editing === "new" ? "Create Article" : "Save Changes"}
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
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
