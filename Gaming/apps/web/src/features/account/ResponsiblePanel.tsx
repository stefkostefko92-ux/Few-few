import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DAILY_LIMIT_OPTIONS,
  REALITY_CHECK_OPTIONS,
  SELF_EXCLUSION_PERIODS,
  type ResponsibleSettingsInput,
  type ResponsibleSettingsView,
  type SelfExclusionPeriod,
} from "@aso/shared";
import { Badge, Button, Modal, Panel } from "../../ui";
import { api } from "../../lib/api";
import { RESPONSIBLE_QUERY_KEY, useResponsibleSettings } from "./RealityCheck";
import { readDaily } from "./playTime";

const PERIODS = Object.keys(SELF_EXCLUSION_PERIODS) as SelfExclusionPeriod[];

/** Отговорна игра в профила: напомняне, дневен лимит, самоизключване. */
export function ResponsiblePanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data, isError } = useResponsibleSettings();
  const [period, setPeriod] = useState<SelfExclusionPeriod>("24h");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = useMutation({
    mutationFn: (input: ResponsibleSettingsInput) => api.updateResponsible(input),
    onSuccess: (v: ResponsibleSettingsView) => qc.setQueryData(RESPONSIBLE_QUERY_KEY, v),
  });
  const exclude = useMutation({
    mutationFn: (p: SelfExclusionPeriod) => api.selfExclude(p),
    onSuccess: (v: ResponsibleSettingsView) => {
      qc.setQueryData(RESPONSIBLE_QUERY_KEY, v);
      setConfirmOpen(false);
    },
  });

  const until = data?.selfExcludedUntil ? new Date(data.selfExcludedUntil) : null;
  const todayMinutes = readDaily().minutes;

  return (
    <Panel className="mb-6" id="responsible">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-ink-100">{t("responsible.title")}</h2>
        {until ? <Badge tone="felt">{t("responsible.excludedBadge")}</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t("responsible.hint")}</p>
      {isError ? <p className="mt-2 text-sm text-loss">{t("errors.generic")}</p> : null}

      {/* Напомняне за време в играта */}
      <fieldset className="mt-4">
        <legend className="text-ink-100">{t("responsible.realityLabel")}</legend>
        <span className="mt-0.5 block text-sm text-ink-muted">{t("responsible.realityHint")}</span>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("responsible.realityLabel")}>
          {REALITY_CHECK_OPTIONS.map((m) => {
            const on = (data?.realityCheckMinutes ?? 0) === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!data || save.isPending}
                onClick={() => save.mutate({ realityCheckMinutes: m })}
                className={`min-h-[40px] rounded-full border px-4 text-sm transition ${
                  on ? "border-brass-300 bg-brass-300 text-felt-900" : "border-brass-300/40 text-ink-100"
                }`}
              >
                {m === 0 ? t("responsible.off") : t("responsible.everyMin", { n: m })}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Дневен лимит на сесията */}
      <label className="mt-5 block">
        <span className="text-ink-100">{t("responsible.limitLabel")}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">
          {t("responsible.limitHint", { n: todayMinutes })}
        </span>
        <select
          className="mt-2 min-h-[40px] w-full rounded-card border border-brass-300/40 bg-felt-800 px-3 text-ink-100 sm:w-auto"
          value={data?.dailyLimitMinutes ?? ""}
          disabled={!data || save.isPending}
          onChange={(e) =>
            save.mutate({ dailyLimitMinutes: e.target.value === "" ? null : Number(e.target.value) })
          }
        >
          <option value="">{t("responsible.noLimit")}</option>
          {DAILY_LIMIT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {t("responsible.minutes", { n: m })}
            </option>
          ))}
        </select>
      </label>

      {/* Самоизключване */}
      <div className="mt-6 border-t border-brass-400/10 pt-4">
        <h3 className="text-ink-100">{t("responsible.excludeLabel")}</h3>
        {until ? (
          <p className="mt-1 text-sm text-ink-300" role="status">
            {t("responsible.excludedUntil", { date: until.toLocaleString(i18n.language) })}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">{t("responsible.excludeHint")}</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                className="min-h-[40px] rounded-card border border-brass-300/40 bg-felt-800 px-3 text-ink-100"
                value={period}
                aria-label={t("responsible.excludeLabel")}
                onChange={(e) => setPeriod(e.target.value as SelfExclusionPeriod)}
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`responsible.period.${p}`)}
                  </option>
                ))}
              </select>
              <Button variant="ghost" disabled={!data} onClick={() => setConfirmOpen(true)} className="!text-loss">
                {t("responsible.excludeCta")}
              </Button>
            </div>
          </>
        )}
      </div>

      <a href="/responsible" className="mt-4 inline-block text-sm text-brass-300 underline-offset-2 hover:underline">
        {t("responsible.learnMore")}
      </a>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("responsible.confirmTitle")}>
        <p className="text-ink-300">
          {t("responsible.confirmBody", { period: t(`responsible.period.${period}`) })}
        </p>
        {exclude.isError ? <p className="mt-2 text-sm text-loss">{t("errors.generic")}</p> : null}
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)} className="flex-1">
            {t("account.cancel")}
          </Button>
          <Button loading={exclude.isPending} onClick={() => exclude.mutate(period)} className="flex-1 !bg-loss">
            {t("responsible.confirmCta")}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
