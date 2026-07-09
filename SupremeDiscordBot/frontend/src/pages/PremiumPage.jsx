// frontend/src/pages/PremiumPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, Zap, Check, ExternalLink, CreditCard, Download, Crown, Building2 } from "lucide-react";
import api, { getStripeStatus, openPortal, createAgencyCheckout, exportTicketsCSV, exportApplicationsCSV } from "../api";

const BASE_FEATURES = [
  "1 ticket panel",
  "2 application forms (up to 5 questions)",
  "1 verification panel",
  "Persistent transcripts (30-day retention)",
  "Basic slash commands",
];

// v3.0 — Premium no longer bundles white-label; it lives on its own plan.
const PREMIUM_FEATURES = [
  "Up to 50 panels, forms & 50 questions each",
  "Math captcha + account-age gates",
  "Claim · escalate · round-robin assignment",
  "Sticky + scheduled + recurring messages",
  "Giveaways, polls & advanced analytics",
  "AI auto-replies (Claude) — human in the loop",
  "Webhooks (HMAC) + public REST API",
  "Unlimited transcript retention + CSV/PDF export",
];

const WHITELABEL_FEATURES = [
  "Everything in Premium",
  "White-label custom bot — upload your own token",
  "Runs under your own brand (name & avatar)",
];

// VAT-inclusive EUR prices per plan/interval. Annual ≈ 2 months free.
const PLAN_PRICING = {
  premium:    { month: "€9.99",  year: "€99"  },
  whitelabel: { month: "€19.99", year: "€199" },
  agency5:    { month: "€39.99", year: "€399" },
  agency10:   { month: "€79.99", year: "€799" },
};

const PLAN_LABEL = {
  premium: "Premium",
  whitelabel: "White-label",
  agency5: "Agency 5",
  agency10: "Agency 10",
};

export default function PremiumPage() {
  const { serverId } = useParams();

  const { data: status, isLoading, isError, error } = useQuery({
    queryKey: ["stripeStatus", serverId],
    queryFn: () => getStripeStatus(serverId),
  });

  // v3.0 — избор на план (premium | whitelabel) и период (month | year).
  const [plan, setPlan] = useState("premium");
  const [interval, setInterval] = useState("month");

  // F7 — изрично съгласие за загуба на 14-дневното право на отказ (чл. 16(м)
  // Дир. 2011/83/ЕС). Неотметнато по подразбиране; задължително преди checkout.
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  const checkoutMut = useMutation({
    // F7 — пращаме съгласието + план/период към backend-а; той ги изисква и
    // логва преди да създаде сесията. serverId е PATH параметър (authz:
    // requireServerAdmin); тялото носи { plan, interval, withdrawalConsent }.
    mutationFn: () =>
      api
        .post(`/stripe/create-checkout/${serverId}`, { plan, interval, withdrawalConsent: true })
        .then((r) => r.data),
    onSuccess: (data) => { window.location.href = data.url; },
  });

  // v3.0 — Agency планове (до 5 / до 10 сървъра, един абонамент). Отделен
  // endpoint (/api/agency/checkout), добавян от друг workstream.
  const [agencyPlan, setAgencyPlan] = useState("agency5");
  const [agencyInterval, setAgencyInterval] = useState("month");
  const [agencyConsent, setAgencyConsent] = useState(false);
  const agencyMut = useMutation({
    // F7 — Agency е също дигитална услуга с незабавен достъп → изричното съгласие
    // за загуба на 14-дневното право на отказ е задължително (чл. 16(м)).
    mutationFn: () => createAgencyCheckout({ plan: agencyPlan, interval: agencyInterval, withdrawalConsent: true }),
    onSuccess: (data) => { window.location.href = data.url; },
  });

  const portalMut = useMutation({
    mutationFn: () => openPortal(serverId),
    onSuccess: (data) => { window.location.href = data.url; },
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
      setExportError(err?.response?.data?.error || "Export failed. Make sure this server has Premium.");
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
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
      <div className="p-8">
        <h1 className="text-2xl font-bold text-cs-text mb-4">Premium</h1>
        <div role="alert" className="cs-card bg-yellow-500/10 border-yellow-500/20 text-center py-10">
          {stripeMissing ? (
            <>
              <p className="text-yellow-300 font-semibold mb-2">Payments unavailable</p>
              <p className="text-cs-muted text-sm">
                Payments are temporarily unavailable. Please contact support.
              </p>
            </>
          ) : (
            <>
              <p className="text-yellow-300 font-semibold mb-2">Couldn't load subscription status</p>
              <p className="text-cs-muted text-sm">
                {error?.response?.data?.error || "Something went wrong. Please try again later."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isPremium = status?.isPremium;
  const sub = status?.subscriptionDetails;
  const upgradeFeatures = plan === "whitelabel" ? WHITELABEL_FEATURES : PREMIUM_FEATURES;
  const upgradePrice = PLAN_PRICING[plan][interval];
  const perLabel = interval === "year" ? "per server / year" : "per server / month";

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cs-text">Premium</h1>
        <p className="text-cs-muted text-sm mt-1">Unlock advanced features for this server</p>
      </div>

      {/* Current Status Banner */}
      {isPremium && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5 mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
            <div>
              <p className="font-semibold text-cs-text">Premium Active</p>
              <p className="text-sm text-yellow-300/70">
                {status?.stripeStatus === "trialing" && sub?.currentPeriodEnd
                  ? `Free trial — ends ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                  : sub?.cancelAtPeriodEnd
                  ? `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                  : sub?.currentPeriodEnd
                  ? `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                  : "Active subscription"}
              </p>
            </div>
          </div>
          <button
            onClick={() => portalMut.mutate()}
            disabled={portalMut.isPending}
            className="cs-btn-ghost flex items-center gap-2 text-sm"
          >
            <CreditCard className="w-4 h-4" />
            {portalMut.isPending ? "Loading…" : "Manage Billing"}
          </button>
        </div>
      )}

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {/* Base */}
        <div className={`cs-card flex flex-col ${!isPremium ? "border-cs-cyan/30" : ""}`}>
          <div className="mb-6">
            <p className="text-xs font-semibold text-cs-muted uppercase tracking-wider mb-2">Base Plan</p>
            <p className="text-3xl font-bold text-cs-text">Free</p>
            <p className="text-sm text-cs-muted mt-1">Forever</p>
          </div>
          <ul className="space-y-2 flex-1">
            {BASE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-cs-text">
                <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          {!isPremium && (
            <div className="mt-6 bg-cs-bg rounded-lg px-4 py-2 text-center text-sm text-cs-muted">
              Current Plan
            </div>
          )}
        </div>

        {/* Premium / White-label upgrade */}
        <div className={`cs-card flex flex-col border-cs-gold/30 ${isPremium ? "ring-1 ring-cs-gold/20" : ""}`}>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-cs-gold uppercase tracking-wider">Paid Plans</p>
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
                  {[["month", "Monthly"], ["year", "Annual"]].map(([value, label]) => {
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
                  <p className="text-[11px] text-cs-gold font-mono">≈ 2 months free vs monthly</p>
                )}
              </>
            )}
          </div>

          <div className="mb-6" aria-live="polite">
            <p className="text-3xl font-bold text-cs-text">
              {isPremium ? "€9.99" : upgradePrice}
            </p>
            <p className="text-sm text-cs-muted mt-1">
              {isPremium ? "per server / month" : `${PLAN_LABEL[plan]} · ${perLabel}`}
            </p>
          </div>

          <ul className="space-y-2 flex-1">
            <li className="text-xs text-cs-muted font-semibold uppercase tracking-wide mb-1">
              {plan === "whitelabel" && !isPremium ? "Everything in Premium, plus:" : "Everything in Base, plus:"}
            </li>
            {(isPremium ? PREMIUM_FEATURES : upgradeFeatures).map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-cs-text">
                <Zap className="w-4 h-4 text-cs-gold flex-shrink-0 mt-0.5" />
                {f}
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
                {portalMut.isPending ? "Loading…" : "Manage Subscription"}
              </button>
            ) : (
              <>
                {/* F7 — обща цена с ДДС (преддоговорна информация, чл. 6 / ЗЗП чл. 47) */}
                <p className="text-xs text-cs-muted mb-3">
                  {upgradePrice}/{interval === "year" ? "year" : "month"}, VAT included where applicable
                </p>

                {/* F7 — задължителна, неотметната по подразбиране отметка за
                    изрично съгласие незабавно изпълнение → загуба на 14-дневното
                    право на отказ (чл. 16(м) Дир. 2011/83/ЕС). Достъпно: label е
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
                    I expressly request that the subscription (a digital service) starts
                    immediately. I understand that if I withdraw before it is fully performed I owe a
                    proportionate amount for what was provided, and that my 14-day right of withdrawal
                    is lost only once the service has been fully performed (Art. 16(a) &amp; 14(3),
                    Directive 2011/83/EU).
                  </span>
                </label>

                <button
                  onClick={() => checkoutMut.mutate()}
                  disabled={checkoutMut.isPending || !withdrawalConsent}
                  className="w-full bg-cs-gold hover:bg-cs-goldDim text-black font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cs-gold"
                >
                  <Star className="w-4 h-4 fill-black" />
                  {checkoutMut.isPending ? "Redirecting…" : `Upgrade to ${PLAN_LABEL[plan]}`}
                </button>
                {checkoutMut.isError && (
                  <p role="alert" className="text-danger text-sm mt-3">
                    {checkoutMut.error?.response?.data?.error || "Couldn't start checkout. Please try again."}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Agency — up to 5 / up to 10 servers, one subscription */}
      {!isPremium && (
        <div className="mt-10 max-w-3xl">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-cs-cyan" />
            <h2 className="text-lg font-semibold text-cs-text">Agency — one subscription, many servers</h2>
          </div>
          <div className="cs-card">
            <p className="text-sm text-cs-muted mb-4">
              White-label across multiple servers under a single, reseller-friendly subscription.
            </p>

            <div role="radiogroup" aria-label="Agency plan" className="grid grid-cols-2 gap-3 mb-4">
              {[["agency5", "Up to 5 servers"], ["agency10", "Up to 10 servers"]].map(([value, seats]) => {
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
                {[["month", "Monthly"], ["year", "Annual"]].map(([value, label]) => {
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
                {agencyMut.isPending ? "Redirecting…" : `Get ${PLAN_LABEL[agencyPlan]}`}
              </button>
            </div>
            <label className="flex items-start gap-2 mt-4 text-xs text-cs-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agencyConsent}
                onChange={(e) => setAgencyConsent(e.target.checked)}
                className="mt-0.5 accent-cs-cyan"
              />
              <span>
                I request access to start immediately and acknowledge I lose my 14-day right of
                withdrawal once the subscription is active (Art. 16(m), Directive 2011/83/EU).
              </span>
            </label>
            {agencyMut.isError && (
              <p role="alert" className="text-danger text-sm mt-3">
                {agencyMut.error?.response?.data?.error || "Agency checkout is not available yet. Please try again later."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Export Section (Premium only) */}
      {isPremium && (
        <div className="mt-10 max-w-2xl">
          <h2 className="text-lg font-semibold text-cs-text mb-4">Data Export</h2>
          <div className="cs-card space-y-4">
            <p className="text-sm text-cs-muted">
              Download all your server's data as CSV files for analysis, backups, or migration.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleExport("tickets")}
                disabled={exporting !== null}
                className="cs-btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {exporting === "tickets" ? "Exporting…" : "Export Tickets (CSV)"}
              </button>
              <button
                onClick={() => handleExport("applications")}
                disabled={exporting !== null}
                className="cs-btn-ghost flex items-center gap-2 border border-white/10"
              >
                <Download className="w-4 h-4" />
                {exporting === "applications" ? "Exporting…" : "Export Applications (CSV)"}
              </button>
            </div>
            <p className="text-xs text-cs-muted">
              PDF exports for individual tickets are available from the Tickets page.
            </p>
            {exportError && (
              <p role="alert" className="text-danger text-sm">{exportError}</p>
            )}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="mt-10 max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold text-cs-text">Frequently Asked Questions</h2>
        {[
          { q: "What happens if I cancel?", a: "Your server reverts to the Base plan at the end of the billing period. Your data and settings are preserved." },
          { q: "Can I use Premium on multiple servers?", a: "Premium and White-label are per-server. To cover several servers under one subscription, use an Agency plan (up to 5 or 10 servers)." },
          { q: "What is the White-label bot?", a: "On the White-label plan your server runs its own Discord bot token, so the bot appears with your own name, avatar, and status instead of the shared bot." },
          { q: "Monthly or annual?", a: "Both. Annual billing is roughly two months free compared to paying monthly." },
          { q: "How do I get a refund?", a: "Contact support within 7 days of your purchase for a full refund." },
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
