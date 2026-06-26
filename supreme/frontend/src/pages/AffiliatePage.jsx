// frontend/src/pages/AffiliatePage.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, DollarSign, TrendingUp, Users, Gift, CheckCircle2 } from "lucide-react";
import { getAffiliate, updateAffiliatePayout, requestAffiliatePayout } from "../api";

function formatMoney(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

export default function AffiliatePage() {
  const qc = useQueryClient();
  const [paypalInput, setPaypalInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: aff, isLoading } = useQuery({
    queryKey: ["affiliate"],
    queryFn: getAffiliate,
  });

  const payoutEmailM = useMutation({
    mutationFn: (email) => updateAffiliatePayout(email),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["affiliate"] }); setPaypalInput(""); },
  });

  const payoutRequestM = useMutation({
    mutationFn: requestAffiliatePayout,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["affiliate"] }),
  });

  const copyLink = () => {
    if (!aff?.link) return;
    navigator.clipboard.writeText(aff.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) return <div className="p-8"><div className="cs-card h-40 animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="cs-heading font-display font-bold text-white text-3xl flex items-center gap-2">
          <Gift className="w-7 h-7 text-amber-400" /> Affiliate Program
        </h1>
        <p className="text-cs-muted mt-2 max-w-2xl">
          Earn <strong className="text-amber-400">{Math.round((aff?.commissionRate || 0.2) * 100)}% recurring commission</strong> on
          every paid Premium subscription from servers you refer, for <strong>{aff?.durationMonths || 12} months</strong>.
          Minimum payout: {formatMoney(aff?.minPayoutCents || 2500)}.
        </p>
      </div>

      {/* ═══ Referral link ═══ */}
      <div className="cs-card mb-6">
        <div className="text-xs text-cs-muted uppercase tracking-wider font-mono mb-2">Your Referral Link</div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={aff?.link || ""}
            className="flex-1 bg-cs-surface border border-cs-border px-3 py-2 text-sm font-mono text-cs-text rounded"
            onClick={(e) => e.target.select()}
          />
          <button onClick={copyLink} className="cs-btn-primary flex items-center gap-2">
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="text-xs text-cs-dim mt-2">
          Your code: <span className="font-mono text-cs-cyan">{aff?.code}</span>
        </div>
      </div>

      {/* ═══ Stats ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Clicks" value={aff?.clicks ?? 0} />
        <StatCard icon={Users} label="Signups" value={aff?.signups ?? 0} />
        <StatCard icon={TrendingUp} label="Paid Conversions" value={aff?.conversions ?? 0} accent />
        <StatCard icon={DollarSign} label="Lifetime Earnings" value={formatMoney(aff?.totalEarnings || 0)} />
      </div>

      {/* ═══ Earnings + payout ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="cs-card">
          <h3 className="text-sm text-cs-muted uppercase tracking-wider font-mono mb-2">Pending Balance</h3>
          <div className="text-3xl font-black text-amber-400 mb-2">{formatMoney(aff?.pendingEarnings || 0)}</div>
          <p className="text-xs text-cs-dim mb-4">
            {aff?.eligibleForPayout
              ? "Eligible for payout."
              : `Minimum payout ${formatMoney(aff?.minPayoutCents || 2500)}. You'll be eligible once you reach the threshold.`}
          </p>
          <button
            onClick={() => payoutRequestM.mutate()}
            disabled={!aff?.eligibleForPayout || !aff?.paypalEmail || payoutRequestM.isPending}
            className="cs-btn-primary bg-amber-500 hover:bg-amber-400 text-black border-amber-500 disabled:opacity-40"
          >
            {payoutRequestM.isPending ? "Requesting…" : "Request Payout"}
          </button>
          {payoutRequestM.data && (
            <p role="status" className="text-xs text-green-400 mt-2">✓ {payoutRequestM.data.message}</p>
          )}
        </div>

        <div className="cs-card">
          <h3 className="text-sm text-cs-muted uppercase tracking-wider font-mono mb-2">Lifetime Paid</h3>
          <div className="text-3xl font-black text-white mb-4">{formatMoney(aff?.paidEarnings || 0)}</div>
          <div className="mb-4">
            <label htmlFor="paypal-email" className="text-xs text-cs-muted uppercase tracking-wider font-mono block mb-2">
              PayPal Email (for payouts)
            </label>
            {aff?.paypalEmail && (
              <p className="text-xs text-cs-dim mb-2">
                Current: <span className="font-mono text-cs-cyan">{aff.paypalEmail}</span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                id="paypal-email"
                type="email"
                placeholder={aff?.paypalEmail ? "Enter a new email to update" : "your@paypal.com"}
                value={paypalInput}
                onChange={(e) => setPaypalInput(e.target.value)}
                className="flex-1 bg-cs-surface border border-cs-border px-3 py-2 text-sm rounded text-white"
              />
              <button
                onClick={() => payoutEmailM.mutate(paypalInput)}
                disabled={!paypalInput || payoutEmailM.isPending}
                className="cs-btn-secondary text-xs"
              >
                {payoutEmailM.isPending ? "Saving…" : "Save"}
              </button>
            </div>
            {payoutEmailM.isSuccess && (
              <p role="status" className="text-xs text-green-400 mt-1">Payout email updated.</p>
            )}
            {payoutEmailM.isError && (
              <p role="alert" className="text-xs text-red-400 mt-1">
                {payoutEmailM.error?.response?.data?.error || "Failed to update email."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Referrals table ═══ */}
      <div className="cs-card">
        <h3 className="text-lg font-bold text-white mb-4">Recent Referrals</h3>
        {aff?.referrals?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-cs-border">
                  <th className="py-2 pr-4 font-mono text-xs text-cs-muted uppercase">Server</th>
                  <th className="py-2 pr-4 font-mono text-xs text-cs-muted uppercase">Status</th>
                  <th className="py-2 pr-4 font-mono text-xs text-cs-muted uppercase">Earnings</th>
                  <th className="py-2 font-mono text-xs text-cs-muted uppercase">Since</th>
                </tr>
              </thead>
              <tbody>
                {aff.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-cs-border last:border-b-0">
                    <td className="py-2 pr-4 text-cs-text">
                      {r.server?.name || <span className="text-cs-dim font-mono">{r.referredServerId.slice(-8)}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`cs-badge ${
                        r.status === "active" ? "text-green-400" :
                        r.status === "churned" ? "text-red-400" : "text-amber-400"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-amber-400 font-mono">{formatMoney(r.totalEarnings)}</td>
                    <td className="py-2 text-cs-dim font-mono text-xs">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-cs-dim text-sm">
            No referrals yet. Share your link to start earning.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className={`cs-card !p-4 ${accent ? "border-amber-500/40" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent ? "text-amber-400" : "text-cs-muted"}`} />
        <span className="text-xs text-cs-muted uppercase tracking-wider font-mono">{label}</span>
      </div>
      <div className={`text-2xl font-black ${accent ? "text-amber-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
