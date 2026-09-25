// frontend/src/pages/PremiumPage.jsx
//
// v3.3 — плащанията са САМО през Discord (Premium Apps). Тази страница вече не
// продава нищо сама: тя показва състоянието на сървъра и води към Discord
// магазина, където Discord (препродавач в ЕС) показва крайната цена с ДДС,
// събира плащането, издава разписката и обработва възстановяванията.
//
// Затова тук НЯМА бутон „поръчка със задължение за плащане“ (чл. 8(2) Дир.
// 2011/83) и няма отметка за отказ от правото на отказ (чл. 16(а)) — и двете
// живеят в checkout-а на Discord, който е страната по продажбата. Линкът към
// магазина не е поръчка: той само отваря витрината.
//
// Stripe остава единствено за ЗАВАРЕНИ абонати: порталът за управление/отмяна
// се показва само когато сървърът е обезпечен от Stripe.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Zap, Check, ExternalLink, CreditCard, Download, Crown, Building2, Server as ServerIcon, Trash2 } from "lucide-react";
import {
  getBillingStatus, getBillingConfig, openPortal, exportTicketsCSV, exportApplicationsCSV,
  getServers, getMyAgency, attachAgencyServer, detachAgencyServer, openAgencyPortal,
} from "../api";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmDialog from "../components/ConfirmDialog";

const BASE_FEATURE_KEYS = [
  "premium.feat.base1",
  "premium.feat.base2",
  "premium.feat.base3",
  "premium.feat.base4",
  "premium.feat.base5",
];

// v3.0 — Premium no longer bundles white-label; it lives on its own plan.
const PREMIUM_FEATURE_KEYS = [
  "premium.feat.prem1",
  "premium.feat.prem2",
  "premium.feat.prem3",
  "premium.feat.prem4",
  "premium.feat.prem5",
  "premium.feat.prem6",
  "premium.feat.prem7",
  "premium.feat.prem8",
];

const WHITELABEL_FEATURE_KEYS = [
  "premium.feat.wl1",
  "premium.feat.wl2",
  "premium.feat.wl3",
];

// Само етикети. ЦЕНИТЕ идват от /api/billing/config (едно определение —
// lib/billing.js) и са информативни „от …“: крайната сума с ДДС я показва
// Discord в своя checkout. Agency етикетите остават за ЗАВАРЕНИ агенции.
const PLAN_LABEL = {
  premium: "Premium",
  whitelabel: "White-label",
  agency5: "Agency 5",
  agency10: "Agency 10",
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "");

export default function PremiumPage() {
  const { t } = useT();
  const { serverId } = useParams();

  const { data: status, isLoading, isError, error } = useQuery({
    queryKey: ["billing", serverId],
    queryFn: () => getBillingStatus(serverId),
  });
  const { data: config } = useQuery({
    queryKey: ["billing-config"],
    queryFn: getBillingConfig,
    staleTime: 1000 * 60 * 60,
  });

  // Account-ниво Agency план (ЗАВАРЕН — вече не се продава). Управляващата
  // карта живее тук, защото Premium страницата е билинг домът.
  const { data: mineData } = useQuery({ queryKey: ["my-agency"], queryFn: getMyAgency });
  const myAgency = mineData?.agency || null;

  // Избор на план само за витрината (premium | whitelabel) — месечно, друго няма.
  const [plan, setPlan] = useState("premium");

  // Порталът е САМО за заварени Stripe абонати; провалът се показва (клас
  // „лъжеща грешка", одит 10.08.2026).
  const toast = useToast();
  const portalMut = useMutation({
    mutationFn: () => openPortal(serverId),
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(err?.response?.data?.error || t("auto.actionFailed")),
  });

  const [exportError, setExportError] = useState(null);
  const [exporting, setExporting] = useState(null); // "tickets" | "applications" | null

  async function handleExport(type) {
    setExporting(type);
    setExportError(null);
    try {
      const blob = type === "tickets"
        ? await exportTicketsCSV(serverId)
        : await exportApplicationsCSV(serverId);

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${serverId}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err?.response?.data?.error || t("premium.exportFailed"));
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="h-8 bg-cs-panel rounded w-48 animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-6">
          <div className="cs-card h-80 animate-pulse bg-cs-panel" />
          <div className="cs-card h-80 animate-pulse bg-cs-panel" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-cs-text mb-4">{t("premium.badge")}</h1>
        <div role="alert" className="cs-card bg-warning/10 border-warning/20 text-center py-10">
          <p className="text-warning font-semibold mb-2">{t("premium.statusLoadFailed")}</p>
          <p className="text-cs-muted text-sm">
            {error?.response?.data?.error || t("premium.genericError")}
          </p>
        </div>
      </div>
    );
  }

  const isPremium = status?.isPremium;
  const source = status?.source;
  const discord = status?.discord || {};
  const stripeLegacy = !!status?.stripe?.legacy;
  const portalAvailable = !!status?.stripe?.portalAvailable;
  const storeConfigured = !!config?.discord?.configured;
  const plans = config?.discord?.plans || {};
  const storeUrl = config?.discord?.storeUrl || null;
  const upgradeFeatureKeys = plan === "whitelabel" ? WHITELABEL_FEATURE_KEYS : PREMIUM_FEATURE_KEYS;
  const upgradePrice = plans[plan]?.monthlyEur ? `€${plans[plan].monthlyEur}` : null;
  const upgradeUrl = plans[plan]?.url || storeUrl;

  // Едно изречение за състоянието — по ИЗТОЧНИКА на правата, не по комбинация
  // от колони (класът „едно правило, N определения“).
  let statusLine = t("premium.activeSubscription");
  if (source === "agency") statusLine = t("agency.covered");
  else if (source === "grace" && status?.accessUntil) statusLine = t("premium.cancelsOn", { date: fmtDate(status.accessUntil) });
  else if (source === "discord") {
    if (discord.statusLabel === "ending" && discord.currentPeriodEnd) statusLine = t("premium.discord.ending", { date: fmtDate(discord.currentPeriodEnd) });
    else if (discord.currentPeriodEnd) statusLine = t("premium.discord.renews", { date: fmtDate(discord.currentPeriodEnd) });
    else statusLine = t("premium.discord.billedBy");
  } else if (source === "stripe") statusLine = t("premium.legacy.card");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cs-text">{t("premium.badge")}</h1>
        <p className="text-cs-muted text-sm mt-1">{t("premium.subtitle")}</p>
      </div>

      {/* Current Status Banner */}
      {isPremium && (
        <div className="bg-cs-gold/10 border border-cs-gold/20 rounded-xl p-5 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-cs-gold fill-cs-gold" />
            <div>
              <p className="font-semibold text-cs-text">{t("premium.activeStatus")}</p>
              <p className="text-sm text-cs-gold/70">{statusLine}</p>
              {source === "agency" && !status?.agencyOwnedByMe && (
                <p className="text-xs text-cs-dim mt-0.5">{t("agency.coveredNotOwner")}</p>
              )}
              {source === "discord" && (
                <p className="text-xs text-cs-dim mt-0.5">{t("premium.discord.manageHint")}</p>
              )}
              {source === "stripe" && (
                <p className="text-xs text-cs-dim mt-0.5">{t("premium.legacy.hint")}</p>
              )}
            </div>
          </div>
          {source === "discord" && discord.manageUrl && (
            <a
              href={discord.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cs-btn-ghost flex items-center gap-2 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {t("premium.discord.manage")}
            </a>
          )}
          {stripeLegacy && portalAvailable && (
            <button
              onClick={() => portalMut.mutate()}
              disabled={portalMut.isPending}
              className="cs-btn-ghost flex items-center gap-2 text-sm"
            >
              <CreditCard className="w-4 h-4" />
              {portalMut.isPending ? t("premium.loading") : t("premium.manageBilling")}
            </button>
          )}
        </div>
      )}

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {/* Base */}
        <div className={`cs-card flex flex-col ${!isPremium ? "border-cs-cyan/30" : ""}`}>
          <div className="mb-6">
            <p className="text-xs font-semibold text-cs-muted uppercase tracking-wider mb-2">{t("premium.basePlan")}</p>
            <p className="text-3xl font-bold text-cs-text">{t("premium.priceFree")}</p>
            <p className="text-sm text-cs-muted mt-1">{t("premium.forever")}</p>
          </div>
          <ul className="space-y-2 flex-1">
            {BASE_FEATURE_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm text-cs-text">
                <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                {t(k)}
              </li>
            ))}
          </ul>
          {!isPremium && (
            <div className="mt-6 bg-cs-bg rounded-lg px-4 py-2 text-center text-sm text-cs-muted">
              {t("premium.currentPlan")}
            </div>
          )}
        </div>

        {/* Premium / White-label — витрина към Discord магазина */}
        <div className={`cs-card flex flex-col border-cs-gold/30 ${isPremium ? "ring-1 ring-cs-gold/20" : ""}`}>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-cs-gold uppercase tracking-wider">{t("premium.paidPlans")}</p>
              <Star className="w-3 h-3 text-cs-gold fill-cs-gold" />
            </div>

            {!isPremium && (
              <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2 mb-3">
                {[["premium", Star], ["whitelabel", Crown]].map(([value, Icon]) => {
                  const active = plan === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPlan(value)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                        active ? "border-cs-gold bg-cs-gold/10 text-cs-text" : "border-cs-border text-cs-muted hover:text-cs-text"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? "text-cs-gold" : ""}`} />
                      {PLAN_LABEL[value]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mb-6" aria-live="polite">
            <p className="text-3xl font-bold text-cs-text">
              {isPremium
                ? (PLAN_LABEL[status?.plan] || "Premium")
                : (upgradePrice ? t("premium.discord.fromPrice", { price: upgradePrice }) : PLAN_LABEL[plan])}
            </p>
            <p className="text-sm text-cs-muted mt-1">
              {isPremium ? statusLine : `${PLAN_LABEL[plan]} · ${t("premium.discord.perServerMonth")}`}
            </p>
          </div>

          <ul className="space-y-2 flex-1">
            <li className="text-xs text-cs-muted font-semibold uppercase tracking-wide mb-1">
              {plan === "whitelabel" && !isPremium ? t("premium.everythingPremium") : t("premium.everythingBase")}
            </li>
            {(isPremium ? PREMIUM_FEATURE_KEYS : upgradeFeatureKeys).map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm text-cs-text">
                <Zap className="w-4 h-4 text-cs-gold flex-shrink-0 mt-0.5" />
                {t(k)}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            {isPremium ? (
              source === "discord" && discord.manageUrl ? (
                <a
                  href={discord.manageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full cs-btn-ghost flex items-center justify-center gap-2 border border-cs-gold/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("premium.discord.manage")}
                </a>
              ) : stripeLegacy && portalAvailable ? (
                <button
                  onClick={() => portalMut.mutate()}
                  disabled={portalMut.isPending}
                  className="w-full cs-btn-ghost flex items-center justify-center gap-2 border border-cs-gold/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  {portalMut.isPending ? t("premium.loading") : t("premium.manageSubscription")}
                </button>
              ) : null
            ) : (
              <>
                {/* Преддоговорна информация: Discord е продавачът и показва
                    крайната цена с ДДС в своя checkout. Тук — само „от“. */}
                <p className="text-xs text-cs-muted mb-4">{t("premium.discord.storeHint")}</p>

                {storeConfigured && upgradeUrl ? (
                  <a
                    href={upgradeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-cs-gold hover:bg-cs-goldDim text-black font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Star className="w-4 h-4 fill-black" />
                    {t("premium.discord.openStore")}
                  </a>
                ) : (
                  <p role="alert" className="text-warning text-sm">{t("premium.discord.notConfigured")}</p>
                )}
                <p className="text-[11px] text-cs-dim mt-3">{t("premium.discord.cancelHint")}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Agency управление — само за ЗАВАРЕНИ агенции (вече не се продават). */}
      {myAgency && <AgencyManageCard agency={myAgency} serverId={serverId} t={t} />}

      {/* Export Section (Premium only) */}
      {isPremium && (
        <div className="mt-10 max-w-2xl">
          <h2 className="text-lg font-semibold text-cs-text mb-4">{t("premium.dataExport")}</h2>
          <div className="cs-card space-y-4">
            <p className="text-sm text-cs-muted">
              {t("premium.dataExportDesc")}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleExport("tickets")}
                disabled={exporting !== null}
                className="cs-btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {exporting === "tickets" ? t("premium.exporting") : t("premium.exportTickets")}
              </button>
              <button
                onClick={() => handleExport("applications")}
                disabled={exporting !== null}
                className="cs-btn-ghost flex items-center gap-2 border border-white/10"
              >
                <Download className="w-4 h-4" />
                {exporting === "applications" ? t("premium.exporting") : t("premium.exportApplications")}
              </button>
            </div>
            <p className="text-xs text-cs-muted">
              {t("premium.pdfNote")}
            </p>
            {exportError && (
              <p role="alert" className="text-danger text-sm">{exportError}</p>
            )}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="mt-10 max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold text-cs-text">{t("premium.faqTitle")}</h2>
        {[
          { q: t("premium.faq.payQ"), a: t("premium.faq.payA") },
          { q: t("premium.faq.cancelQ"), a: t("premium.faq.cancelA") },
          { q: t("premium.faq.multiServer"), a: t("premium.faq.multiServerA") },
          { q: t("premium.faq.whitelabelQ"), a: t("premium.faq.whitelabelA") },
          { q: t("premium.faq.refundQ"), a: t("premium.faq.refundA") },
        ].map(({ q, a }) => (
          <div key={q} className="cs-card">
            <p className="font-medium text-cs-text mb-1">{q}</p>
            <p className="text-sm text-cs-muted">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Agency управляваща карта (ЗАВАРЕНИ агенции) ─────────────────────────────
   Вижда я само собственикът на агенция (getMyAgency връща null иначе).
   Seats се закачат/махат тук; лимитът и authz живеят в backend-а
   (advisory lock срещу надвишаване при race). */
function AgencyManageCard({ agency, serverId, t }) {
  const qc = useQueryClient();
  const [confirmDetach, setConfirmDetach] = useState(null); // {id, name} | null
  const [pickedServer, setPickedServer] = useState("");
  const [actionError, setActionError] = useState(null);

  // Сървърите, които администрирам — кандидати за закачане (без вече закачените).
  const { data: myServers = [] } = useQuery({ queryKey: ["servers"], queryFn: getServers });
  const attachedIds = new Set((agency.servers || []).map((s) => s.id));
  const candidates = myServers.filter((s) => !attachedIds.has(s.id));
  const seatsFree = agency.seatLimit - agency.seatsUsed;
  const currentAttached = attachedIds.has(serverId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-agency"] });
    qc.invalidateQueries({ queryKey: ["billing", serverId] });
    qc.invalidateQueries({ queryKey: ["server", serverId] });
    qc.invalidateQueries({ queryKey: ["servers"] });
  };

  const attachMut = useMutation({
    mutationFn: (sid) => attachAgencyServer(agency.id, sid),
    onSuccess: () => { setActionError(null); setPickedServer(""); invalidate(); },
    onError: (err) => {
      const code = err?.response?.data?.code;
      setActionError(code === "SEAT_LIMIT"
        ? t("agency.seatLimitReached")
        : t("agency.attachFailed", { error: err?.response?.data?.error || err.message }));
    },
  });
  const detachMut = useMutation({
    mutationFn: (sid) => detachAgencyServer(agency.id, sid),
    onSuccess: () => { setActionError(null); setConfirmDetach(null); invalidate(); },
    onError: (err) => {
      setConfirmDetach(null);
      setActionError(t("agency.detachFailed", { error: err?.response?.data?.error || err.message }));
    },
  });
  const portalMut = useMutation({
    mutationFn: openAgencyPortal,
    onSuccess: (data) => { window.location.href = data.url; },
    // Тих провал = бутонът „изщраква" и нищо (клас „лъжеща грешка").
    onError: (err) => {
      setActionError(err?.response?.data?.error || t("auto.actionFailed"));
    },
  });

  return (
    <div className="mt-10 max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-cs-cyan" />
        <h2 className="text-lg font-semibold text-cs-text">{t("agency.manageTitle")}</h2>
      </div>
      <div className="cs-card space-y-5">
        {/* План + статус + billing */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="cs-badge-premium"><Crown className="w-3 h-3" aria-hidden="true" /> {PLAN_LABEL[agency.plan] || agency.plan}</span>
            {agency.active
              ? <span className="cs-badge text-success">{t("agency.statusActive")}</span>
              : <span className="cs-badge text-warning">{t("agency.statusPending")}</span>}
          </div>
          <button
            onClick={() => portalMut.mutate()}
            disabled={portalMut.isPending}
            className="cs-btn-ghost flex items-center gap-2 text-sm border border-cs-border"
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            {portalMut.isPending ? t("premium.loading") : t("premium.manageBilling")}
          </button>
        </div>

        {!agency.active && (
          <p className="text-xs text-warning">{t("agency.pendingNote")}</p>
        )}

        {/* Seats — директен етикет + лента */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-cs-muted uppercase tracking-wider font-mono">{t("agency.seats")}</span>
            <span className="text-sm text-cs-text font-semibold tabular-nums">
              {t("agency.seatsUsed", { used: agency.seatsUsed, limit: agency.seatLimit })}
            </span>
          </div>
          <div className="h-2 bg-cs-surface rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cs-cyan to-cs-gold transition-all"
              style={{ width: `${Math.min(100, (agency.seatsUsed / Math.max(1, agency.seatLimit)) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-cs-dim mt-1">{t("agency.upgradeHint")}</p>
        </div>

        {/* Закачени сървъри */}
        <div>
          <h3 className="text-sm font-semibold text-cs-text mb-2">{t("agency.attachedServers")}</h3>
          {agency.servers?.length ? (
            <ul className="space-y-2">
              {agency.servers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-cs-border last:border-b-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {s.icon
                      ? <img src={s.icon} alt="" className="w-6 h-6 rounded" />
                      : <ServerIcon className="w-4 h-4 text-cs-dim" aria-hidden="true" />}
                    <span className="text-sm text-cs-text truncate">{s.name}</span>
                    {s.id === serverId && <span className="cs-badge text-cs-cyan flex-shrink-0">{t("agency.thisServer")}</span>}
                  </div>
                  <button
                    onClick={() => setConfirmDetach({ id: s.id, name: s.name })}
                    disabled={detachMut.isPending}
                    aria-label={t("agency.detachAria", { name: s.name })}
                    className="text-danger hover:text-red-300 p-1.5 flex items-center gap-1.5 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t("agency.detach")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cs-dim">{t("agency.noServers")}</p>
          )}
        </div>

        {/* Закачане — текущият сървър с един клик; другите през избор */}
        {agency.active && seatsFree > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {!currentAttached && (
              <button
                onClick={() => attachMut.mutate(serverId)}
                disabled={attachMut.isPending}
                className="cs-btn-primary flex items-center gap-2 text-sm"
              >
                <Star className="w-4 h-4" aria-hidden="true" />
                {attachMut.isPending ? t("agency.attaching") : t("agency.attachThis")}
              </button>
            )}
            {candidates.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="agency-attach-picker" className="sr-only">{t("agency.attachOtherLabel")}</label>
                <select
                  id="agency-attach-picker"
                  className="cs-input !w-56 text-sm"
                  value={pickedServer}
                  onChange={(e) => setPickedServer(e.target.value)}
                >
                  <option value="">{t("agency.selectPh")}</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => pickedServer && attachMut.mutate(pickedServer)}
                  disabled={!pickedServer || attachMut.isPending}
                  className="cs-btn-secondary text-sm disabled:opacity-50"
                >
                  {attachMut.isPending ? t("agency.attaching") : t("agency.attach")}
                </button>
              </div>
            )}
          </div>
        )}
        {agency.active && seatsFree <= 0 && (
          <p className="text-xs text-warning">{t("agency.seatLimitReached")}</p>
        )}

        {actionError && (
          <p role="alert" className="text-danger text-sm">{actionError}</p>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDetach}
        title={t("agency.detachTitle")}
        message={confirmDetach ? t("agency.detachMsg", { name: confirmDetach.name }) : ""}
        confirmLabel={t("agency.detach")}
        destructive
        loading={detachMut.isPending}
        onConfirm={() => confirmDetach && detachMut.mutate(confirmDetach.id)}
        onCancel={() => setConfirmDetach(null)}
      />
    </div>
  );
}
