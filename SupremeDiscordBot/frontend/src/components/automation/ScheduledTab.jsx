// frontend/src/components/automation/ScheduledTab.jsx
// Планирани съобщения — раздел на страницата „Съобщения“ (Premium).
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect from "../DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Trash2, Plus } from "lucide-react";
import { getScheduled, createScheduled, deleteScheduled } from "../../api";
import ConfirmDialog from "../ConfirmDialog";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { mutErr, Empty, ErrorCard } from "./shared";

// Зоната на браузъра (IANA, напр. „Europe/Sofia“); null, ако браузърът не я казва.
const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

export default function ScheduledTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: scheduled = [], isLoading, isError } = useQuery({
    queryKey: ["scheduled", serverId],
    queryFn: () => getScheduled(serverId),
  });
  const createM = useMutation({ mutationFn: (data) => createScheduled(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scheduled", serverId] }); setForm({ channelId: "", content: "", sendAt: "", recurrence: "", embedTitle: "" }); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });
  const deleteM = useMutation({ mutationFn: (id) => deleteScheduled(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => {
        e.preventDefault();
        // Часът се въвежда в местно време — пращаме и зоната, за да остане „9:00“
        // 9:00 и след смяната на времето (бекенд: lib/recurrence.js).
        createM.mutate({ ...form, recurrence: form.recurrence || null, sendAt: new Date(form.sendAt).toISOString(), timeZone: browserTimeZone() });
      }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">{t("auto.sched.new")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.channel")}</span>
            <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => setForm({ ...form, channelId: v })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.sendAtLocal")}</span>
            <input required type="datetime-local" className="cs-input" value={form.sendAt} onChange={(e) => setForm({ ...form, sendAt: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.embedTitleOpt")}</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.recurrence")}</span>
            <select className="cs-select" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              <option value="">{t("auto.sched.oneShot")}</option>
              <option value="daily">{t("auto.sched.daily")}</option>
              <option value="weekly">{t("auto.sched.weekly")}</option>
              <option value="monthly">{t("auto.sched.monthly")}</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.content")}</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={createM.isPending}>
          <Plus className="w-4 h-4" /> {t("auto.sched.schedule")}
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg={t("auto.sched.loadError")} />}
      {!isLoading && !isError && !scheduled.length && <Empty icon={CalendarClock} msg={t("auto.sched.empty")} />}

      <div className="space-y-3">
        {scheduled.map((m) => (
          <div key={m.id} className="cs-card flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-cs-dim">#{m.channelId.slice(-6)}</span>
                {m.sentAt
                  ? <span className="cs-badge text-cs-dim">{t("auto.sched.sent")}</span>
                  : <span className="cs-badge text-success">{t("auto.sched.pending")}</span>}
                {m.recurrence && <span className="cs-badge text-cs-cyan">{m.recurrence}</span>}
              </div>
              {m.embedTitle && <p className="text-cs-text font-bold mt-1">{m.embedTitle}</p>}
              <p className="text-sm text-cs-text mt-1 line-clamp-2">{m.content}</p>
              <p className="text-xs text-cs-muted mt-1">{new Date(m.sendAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => setConfirmState({ title: t("auto.sched.delete"), message: t("auto.sched.deleteConfirm"), onConfirm: () => deleteM.mutate(m.id) })}
              aria-label={t("auto.sched.delete")}
              title={t("auto.sched.delete")}
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
        confirmLabel={t("common.delete")}
        destructive
        loading={deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
