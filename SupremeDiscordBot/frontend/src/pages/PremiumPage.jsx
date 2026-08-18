// frontend/src/pages/PremiumPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Zap, Check, ExternalLink, CreditCard, Download, Crown, Building2, Server as ServerIcon, Trash2 } from "lucide-react";
import api, {
  getStripeStatus, openPortal, createAgencyCheckout, exportTicketsCSV, exportApplicationsCSV,
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

// VAT-inclusive EUR prices per plan/interval. Annual ≈ 2 months free.
// Дисплейните цени ТРЯБВА да съвпадат със Stripe price-овете (scripts/
// stripe-setup.sh) — иначе преддоговорната информация лъже (ЗЗП/CRD чл. 6).
const PLAN_PRICING = {
  premium:    { month: "€4.99",  year: "€49"  },
  whitelabel: { month: "€9.99",  year: "€99"  },
  agency5:    { month: "€19.99", year: "€199" },
  agency10:   { month: "€39.99", year: "€399" },
};

const PLAN_LABEL = {
  premium: "Premium",
  whitelabel: "White-label",
  agency5: "Agency 5",
  agency10: "Agency 10",
};

export default function PremiumPage() {
  const { t } = useT();
  const { serverId } = useParams();

  const { data: status, isLoading, isError, error } = useQuery({
    queryKey: ["stripeStatus", serverId],
    queryFn: () => getStripeStatus(serverId),
  });

  // Account-ниво Agency план (ако викащият притежава такъв) — независим от
  // сървърния абонамент. Управляващата карта живее тук, защото Premium
  // страницата е билинг домът; seats се закачат per сървър.
  const { data: mineData } = useQuery({ queryKey: ["my-agency"], queryFn: getMyAgency });
  const myAgency = mineData?.agency || null;

  // v3.0 — избор на план (premium | whitelabel) и период (month | year).
  const [plan, setPlan] = useState("premium");
  const [interval, setInterval] = useState("month");

  // F7 — изрично съгласие по чл. 16(а) Дир. 2011/83/ЕС (дигитална УСЛУГА:
  // правото на отказ се губи едва при пълно изпълнение; при по-ранен отказ се
  // дължи пропорционална сума — чл. 14(3)). Неотметнато по подразбиране;
  // задължително преди checkout. Пращаме РЕАЛНАТА state стойност, за да не се
  // разсинхронизира UI-гейтът от логваното доказателство.
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  const checkoutMut = useMutation({
    // F7 — пращаме съгласието + план/период към backend-а; той ги изисква и
    // логва преди да създаде сесията. serverId е PATH параметър (authz:
    // requireServerAdmin); тялото носи { plan, interval, withdrawalConsent }.
    mutationFn: () =>
      api
        .post(`/stripe/create-checkout/${serverId}`, { plan, interval, withdrawalConsent })
        .then((r) => r.data),
    onSuccess: (data) => { window.location.href = data.url; },
  });

  // v3.0 — Agency планове (до 5 / до 10 сървъра, един абонамент).
  const [agencyPlan, setAgencyPlan] = useState("agency5");
  const [agencyInterval, setAgencyInterval] = useState("month");
  const [agencyConsent, setAgencyConsent] = useState(false);
  const agencyMut = useMutation({
    // F7 — Agency е също дигитална услуга: същото чл. 16(а) съгласие.
    mutationFn: () => createAgencyCheckout({ plan: agencyPlan, interval: agencyInterval, withdrawalConsent: agencyConsent }),
    onSuccess: (data) => { window.location.href = data.url; },
  });

  // Провалът потъваше безследно — „Manage subscription" изщракваше и нищо
  // (класът „лъжеща грешка", одит 10.08.2026).
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
    // Backend returns 503 when STRIPE_SECRET_KEY is missing; any other
    // failure (network, 401, 500) is not a configuration problem.
    const stripeMissing = error?.response?.status === 503;
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-cs-text mb-4">{t("premium.badge")}</h1>
        <div role="alert" className="cs-card bg-warning/10 border-warning/20 text-center py-10">
          {stripeMissing ? (
            <>
              <p className="text-warning font-semibold mb-2">{t("premium.paymentsUnavailable")}</p>
              <p className="text-cs-muted text-sm">
                {t("premium.paymentsUnavailableBody")}
              </p>
            </>
          ) : (
            <>
              <p className="text-warning font-semibold mb-2">{t("premium.statusLoadFailed")}</p>
              <p className="text-cs-muted text-sm">
                {error?.response?.data?.error || t("premium.genericError")}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isPremium = status?.isPremium;
  const sub = status?.subscriptionDetails;
  const upgradeFeatureKeys = plan === "whitelabel" ? WHITELABEL_FEATURE_KEYS : PREMIUM_FEATURE_KEYS;
  const upgradePrice = PLAN_PRICING[plan][interval];
  const perLabel = interval === "year" ? t("premium.perServerYear") : t("premium.perServerMonth");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cs-text">{t("premium.badge")}</h1>
        <p className="text-cs-muted text-sm mt-1">{t("premium.subtitle")}</p>
      </div>

      {/* Current Status Banner */}
      {isPremium && (
        <div className="bg-cs-gold/10 border border-cs-gold/20 rounded-xl p-5 mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-cs-gold fill-cs-gold" />
            <div>
              <p className="font-semibold text-cs-text">{t("premium.activeStatus")}</p>
              <p className="text-sm text-cs-gold/70">
                {status?.agencyCovered && !status?.stripeSubscriptionId
                  ? t("agency.covered")
                  : status?.stripeStatus === "trialing" && sub?.currentPeriodEnd
                  ? t("premium.freeTrialEnds", { date: new Date(sub.currentPeriodEnd).toLocaleDateString() })
                  : sub?.cancelAtPeriodEnd
                  ? t("premium.cancelsOn", { date: new Date(sub.currentPeriodEnd).toLocaleDateString() })
                  : sub?.currentPeriodEnd
                  ? t("premium.renewsOn", { date: new Date(sub.currentPeriodEnd).toLocaleDateString() })
                  : t("premium.activeSubscription")}
              </p>
              {status?.agencyCovered && !status?.agencyOwnedByMe && (
                <p className="text-xs text-cs-dim mt-0.5">{t("agency.coveredNotOwner")}</p>
              )}
            </div>
          </div>
          {/* Agency-покрит сървър няма собствен Stripe customer — per-server
              портал би върнал 404. Собственикът на агенцията управлява от
              agency портала; чужд seat няма billing бутон изобщо. */}
          {(!status?.agencyCovered || status?.stripeSubscriptionId) && (
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

        {/* Premium / White-label upgrade */}
        <div className={`cs-card flex flex-col border-cs-gold/30 ${isPremium ? "ring-1 ring-cs-gold/20" : ""}`}>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-cs-gold uppercase tracking-wider">{t("premium.paidPlans")}</p>
              <Star className="w-3 h-3 text-cs-gold fill-cs-gold" />
            </div>

            {!isPremium && (
              <>
                {/* Plan selector — Premium vs White-label */}
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

                {/* Interval toggle — Monthly vs Annual (≈2 months free) */}
                <div role="radiogroup" aria-label="Billing interval" className="inline-flex items-center gap-1 p-1 rounded-full border border-cs-border bg-cs-surface/60 mb-1">
                  {[["month", t("premium.monthly")], ["year", t("premium.annual")]].map(([value, label]) => {
                    const active = interval === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setInterval(value)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                          active ? "bg-cs-gold text-black" : "text-cs-muted hover:text-cs-text"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {interval === "year" && (
                  <p className="text-[11px] text-cs-gold font-mono">{t("premium.twoMonthsFree")}</p>
                )}
              </>
            )}
          </div>

          <div className="mb-6" aria-live="polite">
            <p className="text-3xl font-bold text-cs-text">
              {isPremium
                ? (PLAN_PRICING[status?.plan]?.[status?.billingInterval || "month"] || PLAN_PRICING.premium.month)
                : upgradePrice}
            </p>
            <p className="text-sm text-cs-muted mt-1">
              {isPremium
                ? (status?.billingInterval === "year"
                    ? t("premium.planPerYear", { plan: PLAN_LABEL[status?.plan] || "Premium" })
                    : t("premium.planPerMonth", { plan: PLAN_LABEL[status?.plan] || "Premium" }))
                : `${PLAN_LABEL[plan]} · ${perLabel}`}
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
              <button
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending}
                className="w-full cs-btn-ghost flex items-center justify-center gap-2 border border-cs-gold/20"
              >
                <ExternalLink className="w-4 h-4" />
                {portalMut.isPending ? t("premium.loading") : t("premium.manageSubscription")}
              </button>
            ) : (
              <>
                {/* F7 — обща цена с ДДС + авто-подновяване (преддоговорна
                    информация, чл. 6(1)(д),(о) Дир. 2011/83 / ЗЗП чл. 47) */}
                <p className="text-xs text-cs-muted mb-3">
                  {interval === "year"
                    ? t("premium.priceLineYear", { price: upgradePrice })
                    : t("premium.priceLineMonth", { price: upgradePrice })}
                </p>

                {/* F7 — задължителна, неотметната по подразбиране отметка за
                    изрично съгласие незабавно изпълнение → загуба на 14-дневното
                    право на отказ (чл. 16(а) Дир. 2011/83/ЕС). Достъпно: label е
                    свързан с input, target ≥24px, видим focus ring. */}
                <label
                  htmlFor="withdrawal-consent"
                  className="flex items-start gap-3 mb-4 cursor-pointer text-sm text-cs-text"
                >
                  <input
                    id="withdrawal-consent"
                    type="checkbox"
                    checked={withdrawalConsent}
                    onChange={(e) => setWithdrawalConsent(e.target.checked)}
                    className="mt-0.5 w-6 h-6 flex-shrink-0 accent-cs-gold rounded focus:outline-none focus:ring-2 focus:ring-cs-gold focus:ring-offset-2 focus:ring-offset-dark-300"
                  />
                  <span>
                    {t("premium.consent")}
                  </span>
                </label>

                <button
                  onClick={() => checkoutMut.mutate()}
                  disabled={checkoutMut.isPending || !withdrawalConsent}
                  className="w-full bg-cs-gold hover:bg-cs-goldDim text-black font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cs-gold"
                >
                  <Star className="w-4 h-4 fill-black" />
                  {/* Чл. 8(2) от Директива 2011/83/ЕС: бутонът, който задейства
                      поръчката, трябва да е обозначен ЧЕТИМО и НЕДВУСМИСЛЕНО с
                      „поръчка със задължение за плащане" или равностойно. „Upgrade
                      to Premium" не е равностойно — то не казва, че се плаща. При
                      неизпълнение потребителят НЕ Е ОБВЪРЗАН от договора, тоест
                      всяко плащане е оспоримо. Затова текстът носи и глагола, и
                      цената, и периода. */}
                  {checkoutMut.isPending
                    ? t("premium.redirecting")
                    : t("premium.subscribeAndPay", {
                        plan: PLAN_LABEL[plan],
                        price: upgradePrice,
                        period: interval === "year" ? t("premium.perYearShort") : t("premium.perMonthShort"),
                      })}
                </button>
                {checkoutMut.isError && (
                  <p role="alert" className="text-danger text-sm mt-3">
                    {checkoutMut.error?.response?.data?.error || t("premium.checkoutFailed")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Agency управление — картата на СОБСТВЕНИКА на агенцията (account-
          ниво, независимо от този сървър). Покупката по-долу се крие при
          активна агенция: backend-ът бездруго връща 400 „already active". */}
      {myAgency && <AgencyManageCard agency={myAgency} serverId={serverId} t={t} />}

      {/* Agency — up to 5 / up to 10 servers, one subscription */}
      {!isPremium && !myAgency?.active && (
        <div className="mt-10 max-w-3xl">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-cs-cyan" />
            <h2 className="text-lg font-semibold text-cs-text">{t("premium.agencyTitle")}</h2>
          </div>
          <div className="cs-card">
            <p className="text-sm text-cs-muted mb-4">
              {t("premium.agencyDesc")}
            </p>

            <div role="radiogroup" aria-label="Agency plan" className="grid grid-cols-2 gap-3 mb-4">
              {[["agency5", t("premium.upTo5")], ["agency10", t("premium.upTo10")]].map(([value, seats]) => {
                const active = agencyPlan === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAgencyPlan(value)}
                    className={`text-left px-4 py-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                      active ? "border-cs-cyan bg-cs-cyan/5" : "border-cs-border hover:border-cs-borderHi"
                    }`}
                  >
                    <div className="font-semibold text-cs-text">{PLAN_LABEL[value]}</div>
                    <div className="text-xs text-cs-muted">{seats}</div>
                    <div className="text-lg font-bold text-cs-text mt-1">
                      {PLAN_PRICING[value][agencyInterval]}
                      <span className="text-xs text-cs-dim font-normal">
                        /{agencyInterval === "year" ? "year" : "month"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div role="radiogroup" aria-label="Agency billing interval" className="inline-flex items-center gap-1 p-1 rounded-full border border-cs-border bg-cs-surface/60">
                {[["month", t("premium.monthly")], ["year", t("premium.annual")]].map(([value, label]) => {
                  const active = agencyInterval === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAgencyInterval(value)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                        active ? "bg-cs-cyan text-black" : "text-cs-muted hover:text-cs-text"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => agencyMut.mutate()}
                disabled={agencyMut.isPending || !agencyConsent}
                className="cs-btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Building2 className="w-4 h-4" />
                {/* Чл. 8(2) важи за ВСЕКИ плащащ бутон поотделно — цената в
                    съседната карта не спасява надпис „Get Agency 5“. По CJEU
                    C-249/21 значение има само текстът НА бутона, затова тук
                    стои същият низ като при личните тарифи: глагол + цена +
                    период. (Правният Разбирач + Продавача, 07.08.2026) */}
                {agencyMut.isPending
                  ? t("premium.redirecting")
                  : t("premium.subscribeAndPay", {
                      plan: PLAN_LABEL[agencyPlan],
                      price: PLAN_PRICING[agencyPlan][agencyInterval],
                      period: agencyInterval === "year" ? t("premium.perYearShort") : t("premium.perMonthShort"),
                    })}
              </button>
            </div>
            {/* F7 — чл. 16(а): за дигитална УСЛУГА правото на отказ се губи
                едва при ПЪЛНО изпълнение, не „щом абонаментът е активен".
                Формулировката е идентична с per-server отметката. */}
            <label className="flex items-start gap-2 mt-4 text-xs text-cs-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agencyConsent}
                onChange={(e) => setAgencyConsent(e.target.checked)}
                className="mt-0.5 accent-cs-cyan"
              />
              <span>
                {t("premium.consentAgency")}
              </span>
            </label>
            <p className="text-[11px] text-cs-dim mt-2">
              {agencyInterval === "year" ? t("premium.agencyRenewYear") : t("premium.agencyRenewMonth")}
            </p>
            {agencyMut.isError && (
              <p role="alert" className="text-danger text-sm mt-3">
                {agencyMut.error?.response?.data?.error || t("premium.agencyCheckoutSoon")}
              </p>
            )}
          </div>
        </div>
      )}

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
          { q: t("premium.faq.cancelQ"), a: t("premium.faq.cancelA") },
          { q: t("premium.faq.multiServer"), a: t("premium.faq.multiServerA") },
          { q: t("premium.faq.whitelabelQ"), a: t("premium.faq.whitelabelA") },
          { q: t("premium.faq.intervalQ"), a: t("premium.faq.intervalA") },
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

/* ─── Agency управляваща карта ─────────────────────────────────────────────────
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
    qc.invalidateQueries({ queryKey: ["stripeStatus", serverId] });
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
