// frontend/src/components/automation/PollsTab.jsx
// Анкети — раздел на страницата „Анкети и раздавания“.
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect from "../DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Trash2, Plus } from "lucide-react";
import { getPolls, createPoll, closePoll, deletePoll } from "../../api";
import Modal from "../Modal";
import ConfirmDialog from "../ConfirmDialog";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { mutErr, Empty, ErrorCard } from "./shared";

const defaultPollForm = () => ({ channelId: "", question: "", optionsText: "", multiChoice: false, durationHours: "" });

export default function PollsTab() {
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
    <Modal open={creating} onClose={() => setCreating(false)} title={t("auto.polls.new")} maxWidth="max-w-lg">
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
            <span className="text-sm text-cs-text">{t("auto.polls.multi")}</span>
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
          <button type="button" onClick={() => setCreating(false)} className="cs-btn-ghost">{t("common.cancel")}</button>
          <button type="submit" className="cs-btn-primary" disabled={createM.isPending}>
            {createM.isPending ? t("common.posting") : t("auto.polls.post")}
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
          <Plus className="w-4 h-4" /> {t("auto.polls.new")}
        </button>
      </div>
      {!polls.length && <Empty icon={BarChart3} msg={t("auto.polls.empty")} />}
      {polls.map((p) => (
        <div key={p.id} className="cs-card flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-cs-text font-bold">{p.question}</span>
              {p.closedAt
                ? <span className="cs-badge text-cs-dim">{t("auto.polls.closed")}</span>
                : <span className="cs-badge text-success">{t("common.active")}</span>}
              {p.multiChoice && <span className="cs-badge text-cs-cyan">{t("auto.polls.multi")}</span>}
            </div>
            <p className="text-xs text-cs-muted mt-1">
              {/* Етикет отпред — без множествено число, което не се превежда с „s“. */}
              {t("auto.polls.meta", { options: p.options.length, votes: p.totalVotes, date: new Date(p.createdAt).toLocaleDateString() })}
              {p.closesAt && ` · ${t("auto.polls.closes", { date: new Date(p.closesAt).toLocaleString() })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!p.closedAt && (
              <button onClick={() => closeM.mutate(p.id)} className="cs-btn-secondary text-xs">{t("common.close")}</button>
            )}
            <button
              onClick={() => setConfirmState({ title: t("auto.polls.delete"), message: t("auto.polls.deleteConfirm"), onConfirm: () => deleteM.mutate(p.id) })}
              aria-label={t("auto.polls.delete")}
              title={t("auto.polls.delete")}
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
