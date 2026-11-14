// frontend/src/components/automation/GiveawaysTab.jsx
// Раздавания — раздел на страницата „Анкети и раздавания“.
import { useState } from "react";
import { useParams } from "react-router-dom";
import DiscordChannelSelect, { DiscordRoleSelect } from "../DiscordPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Trash2, Plus, RefreshCw } from "lucide-react";
import { getGiveaways, createGiveaway, endGiveaway, rerollGiveaway, deleteGiveaway } from "../../api";
import Modal from "../Modal";
import ConfirmDialog from "../ConfirmDialog";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";
import { mutErr, Empty, ErrorCard } from "./shared";

const defaultGiveawayForm = () => ({
  channelId: "", prize: "", description: "", winnerCount: 1, durationMinutes: 60, requiredRoleIds: "",
});

export default function GiveawaysTab() {
  const { t } = useT();
  const toast = useToast();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultGiveawayForm());
  const { data: giveaways = [], isLoading, isError } = useQuery({
    queryKey: ["giveaways", serverId],
    queryFn: () => getGiveaways(serverId),
  });
  const endM    = useMutation({ mutationFn: (id) => endGiveaway(serverId, id),    onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const rerollM = useMutation({ mutationFn: (id) => rerollGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const deleteM = useMutation({ mutationFn: (id) => deleteGiveaway(serverId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ["giveaways", serverId] }), onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")) });
  const createM = useMutation({
    mutationFn: (data) => createGiveaway(serverId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["giveaways", serverId] }); setCreating(false); setForm(defaultGiveawayForm()); },
    onError: (err) => toast.error(mutErr(err) || t("auto.actionFailed")),
  });

  const submitGiveaway = (e) => {
    e.preventDefault();
    createM.mutate({
      channelId: form.channelId.trim(),
      prize: form.prize.trim(),
      description: form.description.trim() || null,
      winnerCount: Number(form.winnerCount) || 1,
      durationMinutes: Number(form.durationMinutes) || 60,
      requiredRoleIds: form.requiredRoleIds.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  const newGiveawayModal = (
    <Modal open={creating} onClose={() => setCreating(false)} title={t("auto.give.new")} maxWidth="max-w-lg">
      <form onSubmit={submitGiveaway} className="space-y-3">
        <label className="block">
          <span className="cs-label">{t("ui.channelReq")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId}
            onChange={(v) => setForm((f) => ({ ...f, channelId: v }))} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.prizeReq")}</span>
          <input className="cs-input" required maxLength={256} value={form.prize}
            onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))}
            placeholder={t("ui.ph.prize")} />
        </label>
        <label className="block">
          <span className="cs-label">{t("ui.description")}</span>
          <textarea className="cs-textarea" rows={2} maxLength={1000} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("ui.ph.giveawayDetails")} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="cs-label">{t("ui.winners")}</span>
            <input type="number" min="1" max="20" className="cs-input" value={form.winnerCount}
              onChange={(e) => setForm((f) => ({ ...f, winnerCount: e.target.value }))} />
          </label>
          <label className="block">
            <span className="cs-label">{t("ui.durationMinReq")}</span>
            <input type="number" min="1" max="43200" required className="cs-input" value={form.durationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          </label>
        </div>
        <label className="block">
          <span className="cs-label">{t("ui.requiredRolesOpt")}</span>
          <DiscordRoleSelect multi value={form.requiredRoleIds} onChange={(v) => setForm((f) => ({ ...f, requiredRoleIds: v }))} requireAssignable={false} />
        </label>
        {createM.isError && (
          <p className="text-danger text-sm" role="alert">
            {typeof createM.error?.response?.data?.error === "string" ? createM.error.response.data.error : t("auto.give.createFailed")}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setCreating(false)} className="cs-btn-ghost">{t("common.cancel")}</button>
          <button type="submit" className="cs-btn-primary" disabled={createM.isPending}>
            {createM.isPending ? t("common.posting") : t("auto.give.start")}
          </button>
        </div>
      </form>
    </Modal>
  );

  if (isLoading) return <div className="cs-card h-32 animate-pulse" />;
  if (isError) return <ErrorCard msg={t("auto.give.loadError")} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => { setForm(defaultGiveawayForm()); setCreating(true); }} className="cs-btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t("auto.give.new")}
        </button>
      </div>
      {!giveaways.length && <Empty icon={Gift} msg={t("auto.give.empty")} />}
      {giveaways.map((g) => (
        <div key={g.id} className="cs-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-cs-text font-bold">🎉 {g.prize}</span>
                {g.endedAt
                  ? <span className="cs-badge text-cs-dim">{t("auto.give.ended")}</span>
                  : <span className="cs-badge text-cs-gold">{t("common.active")}</span>}
              </div>
              <p className="text-xs text-cs-muted mt-1">
                {t("auto.give.meta", { winners: g.winnerCount, entries: g.entryCount })} ·{" "}
                {g.endedAt ? t("auto.give.endedAt", { date: new Date(g.endedAt).toLocaleString() }) : t("auto.give.endsAt", { date: new Date(g.endsAt).toLocaleString() })}
              </p>
              {g.endedAt && g.winnerIds?.length > 0 && (
                <p className="text-xs text-success mt-1">
                  🏆 Winners: {g.winnerIds.map((id) => `<@${id}>`).join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!g.endedAt && (
                <button
                  onClick={() => setConfirmState({ title: t("auto.give.end"), message: t("auto.give.endConfirm"), confirmLabel: t("auto.give.endNow"), destructive: false, onConfirm: () => endM.mutate(g.id) })}
                  className="cs-btn-secondary text-xs"
                >
                  {t("auto.give.endNow")}
                </button>
              )}
              {g.endedAt && (
                <button onClick={() => rerollM.mutate(g.id)} className="cs-btn-secondary text-xs flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> {t("auto.give.reroll")}
                </button>
              )}
              <button
                onClick={() => setConfirmState({ title: t("auto.give.delete"), message: t("auto.give.deleteConfirm"), destructive: true, onConfirm: () => deleteM.mutate(g.id) })}
                aria-label={t("auto.give.delete")}
                title={t("auto.give.delete")}
                className="text-danger hover:text-red-300 p-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || t("common.delete")}
        destructive={confirmState?.destructive ?? true}
        loading={endM.isPending || deleteM.isPending}
        onConfirm={() => { confirmState?.onConfirm?.(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      {newGiveawayModal}
    </div>
  );
}
