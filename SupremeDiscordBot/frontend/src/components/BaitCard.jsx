// frontend/src/components/BaitCard.jsx
// v52 — канал-стръв за спам ботове (backend/src/routes/honeypot.js — вътрешното
// име остава от миграция v52). Каналът, в
// който хората са предупредени да не пишат; спам ботовете пишат навсякъде и
// се изваждат автоматично. Изпълнява ботът (bot/src/utils/bait.js).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fish } from "lucide-react";
import DiscordChannelSelect from "./DiscordPicker";
import { getBait, updateBait } from "../api";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

const ACTIONS = ["softban", "ban", "timeout"];

export default function BaitCard({ serverId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bait", serverId],
    queryFn: () => getBait(serverId),
  });
  if (isLoading || !data) return <div className="cs-card h-32 animate-pulse mb-8" />;
  // key: формата се попълва наново само когато сървърът върне друго състояние.
  return <BaitForm key={`${data.enabled}:${data.channelId}:${data.action}:${data.logChannelId}:${data.dmUser}`} serverId={serverId} data={data} />;
}

function BaitForm({ serverId, data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    // Липсващо поле (стар/непълен отговор) не бива да стига до екрана като
    // „bait.actionHint.undefined“ — подразбиращите се стойности са тези на backend-а.
    enabled: !!data.enabled, channelId: data.channelId || "", action: ACTIONS.includes(data.action) ? data.action : "softban",
    logChannelId: data.logChannelId || "", dmUser: data.dmUser !== false,
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => updateBait(serverId, {
      enabled: !!form.enabled,
      channelId: form.channelId || null,
      action: form.action,
      logChannelId: form.logChannelId || null,
      dmUser: !!form.dmUser,
    }),
    onSuccess: () => { toast.success(t("bait.saved")); qc.invalidateQueries({ queryKey: ["bait", serverId] }); },
    onError: (err) => {
      const code = err?.response?.data?.code;
      toast.error(code ? t(`bait.err.${code}`) : (typeof err?.response?.data?.error === "string" ? err.response.data.error : t("bait.saveFailed")));
    },
  });

  return (
    <section className="cs-card mb-8 space-y-4" aria-labelledby="bait-title">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 id="bait-title" className="font-display font-bold text-cs-text text-xl flex items-center gap-2">
            <Fish className="w-5 h-5 text-cs-cyan" aria-hidden="true" /> {t("bait.title")}
          </h2>
          <p className="text-cs-muted text-sm mt-1 max-w-2xl">{t("bait.intro")}</p>
        </div>
        <div className="text-sm text-cs-dim sm:text-right shrink-0">
          {t("bait.caught")}: <span className="text-cs-text font-bold">{data.caughtCount ?? 0}</span>
        </div>
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span className="text-sm text-cs-text">{t("bait.enabled")}</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="cs-label">{t("bait.channel")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => set("channelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("bait.channelHint")}</p>
        </label>
        <label className="block">
          <span className="cs-label">{t("bait.action")}</span>
          <select className="cs-select" value={form.action} onChange={(e) => set("action", e.target.value)}>
            {ACTIONS.map((a) => <option key={a} value={a}>{t(`bait.action.${a}`)}</option>)}
          </select>
          <p className="text-xs text-cs-dim mt-1">{t(`bait.actionHint.${form.action}`)}</p>
        </label>
        <label className="block">
          <span className="cs-label">{t("bait.log")}</span>
          <DiscordChannelSelect kind="text" value={form.logChannelId} onChange={(v) => set("logChannelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("bait.logHint")}</p>
        </label>
        <label className="flex items-center gap-3 sm:pt-6">
          <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.dmUser} onChange={(e) => set("dmUser", e.target.checked)} />
          <span className="text-sm text-cs-text">{t("bait.dm")}</span>
        </label>
      </div>

      <p className="text-xs text-cs-dim">{t("bait.perms")}</p>

      <div className="flex justify-end">
        <button type="button" className="cs-btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("bait.saving") : t("bait.save")}
        </button>
      </div>
    </section>
  );
}
