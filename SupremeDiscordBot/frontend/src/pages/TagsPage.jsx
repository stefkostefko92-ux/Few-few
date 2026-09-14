// frontend/src/pages/TagsPage.jsx
// Готовите отговори (/tag) — изгледът на СОБСТВЕНИКА.
//
// ЗАЩО (одит 09.08.2026): функцията беше 2/3 — ботът праща тези текстове от
// името на сървъра, а собственикът нямаше как да ги ВИДИ, поправи или изтрие
// без Discord staff достъп. Табло без този екран значи бот, който говори
// от твое име текстове, които не си преглеждал.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, MessageSquareText } from "lucide-react";
import api from "../api";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

export default function TagsPage() {
  const { serverId } = useParams();
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);   // null | "new" | tag
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name: "", content: "" });
  const [formError, setFormError] = useState("");

  const { data: tags, isLoading } = useQuery({
    queryKey: ["canned", serverId],
    queryFn: async () => (await api.get(`/canned/${serverId}`)).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["canned", serverId] });
  const saveMut = useMutation({
    mutationFn: () => editing === "new"
      ? api.post(`/canned/${serverId}`, form)
      : api.put(`/canned/${serverId}/${editing.id}`, form),
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e) => setFormError(e?.response?.data?.error || t("tags.saveFailed")),
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/canned/${serverId}/${id}`),
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
    onError: (e) => toast.error(e?.response?.data?.error || t("tags.deleteFailed")),
  });

  const open = (tag) => {
    setFormError("");
    setForm(tag === "new" ? { name: "", content: "" } : { name: tag.name, content: tag.content });
    setEditing(tag === "new" ? "new" : tag);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-8">
        <div>
          <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
            <MessageSquareText className="w-7 h-7 text-cs-cyan" aria-hidden="true" /> {t("tags.title")}
          </h1>
          <p className="text-cs-muted mt-2 max-w-2xl">{t("tags.subtitle")}</p>
        </div>
        <button onClick={() => open("new")} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden="true" /> {t("tags.new")}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="cs-card h-16 animate-pulse bg-cs-panel" />))}
        </div>
      ) : !tags?.length ? (
        <EmptyState
          icon={MessageSquareText}
          title={t("tags.empty.title")}
          description={t("tags.empty.body")}
          ctaLabel={t("tags.new")}
          onCtaClick={() => open("new")}
        />
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li key={tag.id} className="cs-card !py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-cs-cyan text-sm font-mono">/tag {tag.name}</code>
                  <span className="text-[10px] text-cs-dim font-mono uppercase tracking-wider">
                    {t("tags.used", { n: tag.usageCount })}
                  </span>
                </div>
                <p className="text-sm text-cs-muted mt-1 line-clamp-2 whitespace-pre-wrap">{tag.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => open(tag)} aria-label={t("tags.edit")} title={t("tags.edit")}
                        className="text-cs-cyan hover:opacity-80 p-2">
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
                <button onClick={() => setConfirmDelete(tag)} aria-label={t("tags.delete")} title={t("tags.delete")}
                        className="text-danger hover:text-red-300 p-2">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal open title={editing === "new" ? t("tags.new") : t("tags.edit")} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <label className="block">
              <span className="cs-label">{t("tags.name")}</span>
              <input className="cs-input font-mono" value={form.name} maxLength={32}
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase() }))}
                     placeholder="welcome-info" />
              <p className="text-xs text-cs-dim mt-1">{t("tags.nameHint")}</p>
            </label>
            <label className="block">
              <span className="cs-label">{t("tags.content")}</span>
              <textarea className="cs-textarea" rows={5} value={form.content} maxLength={1500}
                        onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
              <p className="text-xs text-cs-dim mt-1">{form.content.length}/1500</p>
            </label>
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button className="cs-btn-ghost" onClick={() => setEditing(null)}>{t("tags.cancel")}</button>
              <button className="cs-btn-primary" disabled={saveMut.isPending || !form.name || !form.content}
                      onClick={() => saveMut.mutate()}>
                {t("tags.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          title={t("tags.deleteConfirmTitle", { name: confirmDelete.name })}
          message={t("tags.deleteConfirmBody")}
          confirmLabel={t("tags.delete")}
          destructive
          loading={delMut.isPending}
          onConfirm={() => delMut.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
