// frontend/src/pages/WebhooksPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Webhook as WebhookIcon, CheckCircle2, XCircle } from "lucide-react";
import {
  getWebhooks, createWebhook, updateWebhook, deleteWebhook, getWebhookEvents,
} from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { useT } from "../contexts/I18nContext";

const defaultForm = () => ({
  name: "",
  url: "",
  secret: "",
  enabled: true,
  events: [],
});

export default function WebhooksPage() {
  const { t } = useT();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(defaultForm());
  const [confirmState, setConfirmState] = useState(null);
  const [formError, setFormError] = useState(null);

  const { data: hooks = [], isLoading, isError } = useQuery({
    queryKey: ["webhooks", serverId],
    queryFn: () => getWebhooks(serverId),
  });

  const { data: eventsData } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: getWebhookEvents,
  });
  const ALL_EVENTS = eventsData?.events || [];

  const createMut = useMutation({
    mutationFn: (data) => createWebhook(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateWebhook(serverId, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", serverId] }); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => deleteWebhook(serverId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", serverId] }),
  });

  const openNew = () => { setForm(defaultForm()); setFormError(null); setEditing("new"); };
  const openEdit = (h) => {
    setForm({
      name: h.name, url: h.url, secret: h.secret || "",
      enabled: h.enabled, events: h.events || [],
    });
    setFormError(null);
    setEditing(h.id);
  };

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (form.events.length === 0) {
      setFormError(t("webhooks.selectEvent"));
      return;
    }
    const payload = {
      name: form.name,
      url: form.url,
      enabled: form.enabled,
      events: form.events,
      secret: form.secret || null,
    };
    if (editing === "new") createMut.mutate(payload);
    else updateMut.mutate({ id: editing, data: payload });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
            <WebhookIcon className="w-7 h-7 text-cs-cyan" /> {t("webhooks.title")}
          </h1>
          <p className="text-cs-muted mt-2 max-w-2xl">
            {t("webhooks.subtitle")}
          </p>
        </div>
        <button onClick={openNew} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t("webhooks.new")}
        </button>
      </div>

      {isLoading && <div className="cs-card h-32 animate-pulse" />}

      {!isLoading && isError && (
        <div role="alert" className="cs-card text-center py-12 text-danger">
          {t("webhooks.loadError")}
        </div>
      )}

      {!isLoading && !isError && hooks.length === 0 && (
        <EmptyState
          icon={WebhookIcon}
          title={t("webhooks.emptyTitle")}
          description={t("webhooks.emptyBody")}
          ctaLabel={t("webhooks.emptyCta")}
          onCtaClick={openNew}
        />
      )}

      <div className="space-y-3">
        {hooks.map((h) => (
          <div key={h.id} className="cs-card flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-cs-text font-bold truncate">{h.name}</span>
                {h.enabled
                  ? <span className="cs-badge text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t("webhooks.active")}</span>
                  : <span className="cs-badge text-danger flex items-center gap-1"><XCircle className="w-3 h-3" /> {t("webhooks.disabled")}</span>}
                {h.lastStatus && (
                  <span className="cs-badge text-cs-dim font-mono text-xs">{h.lastStatus}</span>
                )}
              </div>
              <div className="text-xs text-cs-dim font-mono truncate">{h.url}</div>
              <div className="text-xs text-cs-dim mt-1">
                {t("webhooks.stats", { events: h.events.length, failures: h.failCount })}
                {h.lastDeliveryAt && ` · ${t("webhooks.last", { date: new Date(h.lastDeliveryAt).toLocaleString() })}`}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button onClick={() => openEdit(h)} aria-label={t("webhooks.editAria", { name: h.name })} title={t("webhooks.editTip")} className="text-cs-cyan hover:opacity-80 p-2">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmState({
                  title: t("webhooks.deleteTitle"),
                  message: t("webhooks.deleteConfirm", { name: h.name }),
                  onConfirm: () => deleteMut.mutate(h.id),
                })}
                aria-label={t("webhooks.deleteAria", { name: h.name })}
                title={t("webhooks.deleteTip")}
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
        title={editing === "new" ? t("webhooks.newTitle") : t("webhooks.editTitle")}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="cs-label">{t("common.name")}</span>
            <input className="cs-input" required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("webhooks.namePh")} />
          </label>

          <label className="block">
            <span className="cs-label">{t("webhooks.urlLabel")}</span>
            <input className="cs-input font-mono text-xs" required type="url" value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder={t("webhooks.urlPh")} />
          </label>

          <label className="block">
            <span className="cs-label">{t("webhooks.secretLabel")}</span>
            <input className="cs-input font-mono text-xs" value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              placeholder={t("webhooks.secretPh")} />
            <p className="text-xs text-cs-dim mt-1">
              {t("webhooks.secretHint")}
            </p>
          </label>

          <fieldset>
            <legend className="cs-label">{t("webhooks.eventsLabel")}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm text-cs-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="accent-cs-cyan"
                  />
                  <code className="text-xs">{ev}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-cs-cyan" />
            <span className="text-sm text-cs-text">{t("common.enabled")}</span>
          </label>

          {formError && (
            <p role="alert" className="text-danger text-sm">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="cs-btn-secondary">{t("common.cancel")}</button>
            <button type="submit" className="cs-btn-primary" disabled={createMut.isPending || updateMut.isPending}>
              {editing === "new" ? t("webhooks.create") : t("common.saveChanges")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={t("common.delete")}
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
