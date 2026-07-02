// frontend/src/pages/PremiumPage.jsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, Zap, Check, ExternalLink, CreditCard, Download } from "lucide-react";
import api, { getStripeStatus, openPortal, exportTicketsCSV, exportApplicationsCSV } from "../api";

const BASE_FEATURES = [
  "Up to 3 ticket panels",
  "Up to 2 logic forms",
  "10 questions per form",
  "HTML transcripts (30 days)",
  "Manual ticket management",
  "Basic slash commands",
];

const PREMIUM_FEATURES = [
  "Unlimited panels, forms & questions",
  "HTML transcripts (forever) + PDF export",
  "AI auto-replies & Round-Robin assignment",
  "White-label bot (custom name, avatar, token)",
  "Priority ticket routing",
  "CSV / XLSX data export",
  "⭐ /premium commands unlocked",
  "Private thread support",
];

export default function PremiumPage() {
  const { serverId } = useParams();

  const { data: status, isLoading, isError, error } = useQuery({
    queryKey: ["stripeStatus", serverId],
    queryFn: () => getStripeStatus(serverId),
  });

  // F7 — изрично съгласие за загуба на 14-дневното право на отказ (чл. 16(м)
  // Дир. 2011/83/ЕС). Неотметнато по подразбиране; задължително преди checkout.
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  const checkoutMut = useMutation({
    // F7 — пращаме съгласието към backend-а; той го изисква и логва преди да
    // създаде сесията. Ползваме директно axios инстанса, за да добавим флага
    // без да пипаме общия api клиент.
    mutationFn: () =>
      api
        // serverId е PATH параметър (authz: requireServerAdmin); withdrawalConsent
        // остава в тялото (чл. 16(м) съгласие).
        .post(`/stripe/create-checkout/${serverId}`, { withdrawalConsent })
        .then((r) => r.data),
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

        {/* Premium */}
        <div className={`cs-card flex flex-col border-yellow-500/30 ${isPremium ? "ring-1 ring-yellow-500/20" : ""}`}>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Premium Plan</p>
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            </div>
            <p className="text-3xl font-bold text-cs-text">€9.99</p>
            <p className="text-sm text-cs-muted mt-1">per server / month</p>
          </div>
          <ul className="space-y-2 flex-1">
            <li className="text-xs text-cs-muted font-semibold uppercase tracking-wide mb-1">Everything in Base, plus:</li>
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-cs-text">
                <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {isPremium ? (
              <button
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending}
                className="w-full cs-btn-ghost flex items-center justify-center gap-2 border border-yellow-500/20"
              >
                <ExternalLink className="w-4 h-4" />
                {portalMut.isPending ? "Loading…" : "Manage Subscription"}
              </button>
            ) : (
              <>
                {/* F7 — обща цена с ДДС (преддоговорна информация, чл. 6 / ЗЗП чл. 47) */}
                <p className="text-xs text-cs-muted mb-3">
                  €9.99/month, VAT included where applicable
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
                    className="mt-0.5 w-6 h-6 flex-shrink-0 accent-yellow-500 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-dark-300"
                  />
                  <span>
                    I expressly request that the Premium subscription starts immediately. I understand that once the service is activated I lose my 14-day right of withdrawal for this billing period (Art. 16(m) Directive 2011/83/EU).
                  </span>
                </label>

                <button
                  onClick={() => checkoutMut.mutate()}
                  disabled={checkoutMut.isPending || !withdrawalConsent}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-yellow-500"
                >
                  <Star className="w-4 h-4 fill-black" />
                  {checkoutMut.isPending ? "Redirecting…" : "Upgrade to Premium"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

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
          { q: "Can I use Premium on multiple servers?", a: "Premium is per-server. Each server needs its own subscription." },
          { q: "What is White-label bot?", a: "Your server can register its own Discord bot token. The bot will appear with your own name, avatar, and status instead of the shared bot." },
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
