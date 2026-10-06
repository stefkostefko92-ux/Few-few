// frontend/src/components/HoneypotCard.jsx
// v52 — капан за спам ботове (backend/src/routes/honeypot.js). Каналът, в
// който хората са предупредени да не пишат; спам ботовете пишат навсякъде и
// се изваждат автоматично. Изпълнява ботът (bot/src/utils/honeypot.js).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import DiscordChannelSelect from "./DiscordPicker";
import { getHoneypot, updateHoneypot } from "../api";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";

const ACTIONS = ["softban", "ban", "timeout"];

export default function HoneypotCard({ serverId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["honeypot", serverId],
    queryFn: () => getHoneypot(serverId),
  });
  if (isLoading || !data) return <div className="cs-card h-32 animate-pulse mb-8" />;
  // key: формата се попълва наново само когато сървърът върне друго състояние.
  return <HoneypotForm key={`${data.enabled}:${data.channelId}:${data.action}:${data.logChannelId}:${data.dmUser}`} serverId={serverId} data={data} />;
}

function HoneypotForm({ serverId, data }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    enabled: data.enabled, channelId: data.channelId || "", action: data.action,
    logChannelId: data.logChannelId || "", dmUser: data.dmUser,
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => updateHoneypot(serverId, {
      enabled: !!form.enabled,
      channelId: form.channelId || null,
      action: form.action,
      logChannelId: form.logChannelId || null,
      dmUser: !!form.dmUser,
    }),
    onSuccess: () => { toast.success(t("honeypot.saved")); qc.invalidateQueries({ queryKey: ["honeypot", serverId] }); },
    onError: (err) => {
      const code = err?.response?.data?.code;
      toast.error(code ? t(`honeypot.err.${code}`) : (typeof err?.response?.data?.error === "string" ? err.response.data.error : t("honeypot.saveFailed")));
    },
  });

  return (
    <section className="cs-card mb-8 space-y-4" aria-labelledby="honeypot-title">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 id="honeypot-title" className="font-display font-bold text-cs-text text-xl flex items-center gap-2">
            <Bug className="w-5 h-5 text-cs-cyan" aria-hidden="true" /> {t("honeypot.title")}
          </h2>
          <p className="text-cs-muted text-sm mt-1 max-w-2xl">{t("honeypot.intro")}</p>
        </div>
        <div className="text-sm text-cs-dim sm:text-right shrink-0">
          {t("honeypot.caught")}: <span className="text-cs-text font-bold">{data.caughtCount}</span>
        </div>
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span className="text-sm text-cs-text">{t("honeypot.enabled")}</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="cs-label">{t("honeypot.channel")}</span>
          <DiscordChannelSelect kind="text" value={form.channelId} onChange={(v) => set("channelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("honeypot.channelHint")}</p>
        </label>
        <label className="block">
          <span className="cs-label">{t("honeypot.action")}</span>
          <select className="cs-select" value={form.action} onChange={(e) => set("action", e.target.value)}>
            {ACTIONS.map((a) => <option key={a} value={a}>{t(`honeypot.action.${a}`)}</option>)}
          </select>
          <p className="text-xs text-cs-dim mt-1">{t(`honeypot.actionHint.${form.action}`)}</p>
        </label>
        <label className="block">
          <span className="cs-label">{t("honeypot.log")}</span>
          <DiscordChannelSelect kind="text" value={form.logChannelId} onChange={(v) => set("logChannelId", v)} />
          <p className="text-xs text-cs-dim mt-1">{t("honeypot.logHint")}</p>
        </label>
        <label className="flex items-center gap-3 sm:pt-6">
          <input type="checkbox" className="accent-cs-cyan w-5 h-5" checked={!!form.dmUser} onChange={(e) => set("dmUser", e.target.checked)} />
          <span className="text-sm text-cs-text">{t("honeypot.dm")}</span>
        </label>
      </div>

      <p className="text-xs text-cs-dim">{t("honeypot.perms")}</p>

      <div className="flex justify-end">
        <button type="button" className="cs-btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("honeypot.saving") : t("honeypot.save")}
        </button>
      </div>
    </section>
  );
}
