// frontend/src/components/automation/StickyTab.jsx
// Закачени съобщения — раздел на страницата „Съобщения“ (Premium).
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { ChannelName } from "../DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pin, Trash2, Plus } from "lucide-react";
import { getStickies, upsertSticky, deleteSticky } from "../../api";
import ConfirmDialog from "../ConfirmDialog";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { mutErr, Empty, ErrorCard } from "./shared";

export default function StickyTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ channelId: "", content: "", embedTitle: "", embedColor: "#8fe600" });
  const [confirmState, setConfirmState] = useState(null);
  const { data: stickies = [], isLoading, isError } = useQuery({
    queryKey: ["stickies", serverId],
    queryFn: () => getStickies(serverId),
  });
  const saveM   = useMutation({ mutationFn: (data) => upsertSticky(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stickies", serverId] }); setForm({ channelId: "", content: "", embedTitle: "", embedColor: "#8fe600" }); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });
  const deleteM = useMutation({ mutationFn: (chId) => deleteSticky(serverId, chId), onSuccess: () => qc.invalidateQueries({ queryKey: ["stickies", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); saveM.mutate(form); }} className="cs-card space-y-3">
        <h3 className="text-cs-text font-bold">{t("auto.sticky.set")}</h3>
        <label className="block">
          <span className="cs-label">{t("ui.channel")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => setForm({ ...form, channelId: v })} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.titleOpt")}</span>
            <input className="cs-input" value={form.embedTitle} onChange={(e) => setForm({ ...form, embedTitle: e.target.value })} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.color")}</span>
            <input type="color" className="cs-input h-10" value={form.embedColor} onChange={(e) => setForm({ ...form, embedColor: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.content")}</span>
          <textarea required rows={3} className="cs-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </label>
        <button type="submit" className="cs-btn-primary flex items-center gap-2" disabled={saveM.isPending}>
          <Plus className="w-4 h-4" /> {t("auto.sticky.save")}
        </button>
      </form>

      {isLoading && <div className="cs-card h-20 animate-pulse" />}
      {!isLoading && isError && <ErrorCard msg={t("auto.sticky.loadError")} />}
      {!isLoading && !isError && !stickies.length && <Empty icon={Pin} msg={t("auto.sticky.empty")} />}

      <div className="space-y-3">
        {stickies.map((s) => (
          <div key={s.id} className="cs-card flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs text-cs-dim">{t("common.channelLabel")} <ChannelName id={s.channelId} /></p>
              {s.embedTitle && <p className="text-cs-text font-bold mt-1">{s.embedTitle}</p>}
              <p className="text-sm text-cs-text mt-1 line-clamp-2">{s.content}</p>
            </div>
            <button
              onClick={() => setConfirmState({ title: t("auto.sticky.delete"), message: t("auto.sticky.deleteConfirm"), onConfirm: () => deleteM.mutate(s.channelId) })}
              aria-label={t("auto.sticky.delete")}
              title={t("auto.sticky.deleteTitle")}
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
