// frontend/src/pages/AdminPage.jsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2, Users, Server, DollarSign, FileText,
  Shield, Ban, Search, Trash2, RotateCcw, Edit, MessageSquare,
  Star, AlertTriangle, CheckCircle, Sparkles, TrendingUp,
} from "lucide-react";
import api, {
  getAnalytics, getRevenue, getAdminUsers, getAdminUser,
  getPayments, getAuditLogs, getAdminServers, getAdminServer,
  deleteAdminServer, resetAdminServer, broadcastToServer, setServerPlan,
  deleteAdminUser, deleteAdminPayment, purgeAuditLogs, updateAdminServer,
} from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

const TABS = [
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "revenue",   label: "Revenue",   icon: TrendingUp },
  { id: "users",     label: "Users",     icon: Users },
  { id: "servers",   label: "Servers",   icon: Server },
  { id: "payments",  label: "Payments",  icon: DollarSign },
  { id: "audit",     label: "Audit Log", icon: FileText },
];

const ROLE_COLORS = {
  MAIN_OWNER:    "cs-badge-premium",
  SUPER_USER:    "cs-badge-manual",
  SUPPORT_STAFF: "cs-badge-cyan",
  USER:          "cs-badge-muted",
};

export default function AdminPage() {
  const [tab, setTab] = useState("analytics");

  return (
    <div className="p-8 max-w-[1600px]">
      {/* Header */}
      <div className="mb-8">
        <div className="cs-eyebrow">→ Super Admin Panel</div>
        <h1 className="font-display font-black text-4xl tracking-tight-4 text-cs-text mb-2">
          Platform <span className="text-cs-cyan">Control</span>
        </h1>
        <p className="text-cs-muted text-sm">
          Global management — analytics, users, servers, payments, audit logs. Manage records.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-8 border-b border-cs-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-mono uppercase tracking-wider
                        transition-colors border-b-2 -mb-px
                        ${tab === id
                          ? "border-cs-cyan text-cs-cyan"
                          : "border-transparent text-cs-muted hover:text-cs-text"
                        }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "analytics" && <AnalyticsTab />}
      {tab === "revenue"   && <RevenueTab />}
      {tab === "users"     && <UsersTab />}
      {tab === "servers"   && <ServersTab />}
      {tab === "payments"  && <PaymentsTab />}
      {tab === "audit"     && <AuditTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsTab() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status">
        <span className="sr-only">Loading analytics…</span>
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="cs-card h-28 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Servers"   value={data?.totalServers ?? 0} />
        <Stat label="Premium Servers" value={data?.premiumServers ?? 0} accent />
        <Stat label="Total Users"     value={data?.totalUsers ?? 0} />
        <Stat label="Open Tickets"    value={data?.openTickets ?? 0} />
        <Stat label="Total Tickets"   value={data?.totalTickets ?? 0} />
        <Stat label="Total Forms"     value={data?.totalForms ?? 0} />
        <Stat label="Applications"    value={data?.totalApplications ?? 0} />
        <Stat label="Panels"          value={data?.totalPanels ?? 0} />
        <Stat label="Premium %"       value={`${data?.premiumPercentage ?? 0}%`} />
        <Stat label="Base Servers"    value={data?.baseServers ?? 0} />
      </div>

      <p className="font-mono text-[10px] uppercase tracking-wider text-cs-dim">
        → Revenue (MRR, ARPU, churn, trial funnel) lives in the Revenue tab — one number, one definition.
      </p>

      {data?.recentTickets?.length > 0 && (
        <div className="cs-card">
          <h2 className="cs-heading font-display font-bold text-cs-text text-xl">Tickets Over Last 30 Days</h2>
          <SparklineChart data={data.recentTickets} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="cs-stat">
      <div className="cs-stat-label">{label}</div>
      <div className={`cs-stat-value ${accent ? "text-cs-cyan" : ""}`}>{value}</div>
    </div>
  );
}

function SparklineChart({ data }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1 h-32 pt-4">
      {data.map((d, i) => {
        const h = max > 0 ? (d.count / max) * 100 : 0;
        return (
          <div
            key={i}
            className="flex-1 bg-cs-cyan hover:bg-white transition-colors relative group cursor-default"
            style={{ height: `${Math.max(h, 2)}%` }}
            role="img"
            aria-label={`${new Date(d.date).toLocaleDateString()}: ${d.count} tickets`}
            title={`${new Date(d.date).toLocaleDateString()}: ${d.count} tickets`}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-cs-panel border border-cs-border text-[10px] font-mono px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {d.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE — единственото място с приходни числа (GET /api/admin/revenue).
// Всички суми са в EUR. Каталожните цени са с ВКЛЮЧЕН ДДС (tax_behavior=
// inclusive), затова показваме бруто и нето-приблизител (÷1.20, BG ставка).
// ═══════════════════════════════════════════════════════════════════════════════

const eur = (n) => `€${Number(n ?? 0).toFixed(2)}`;
const pct = (n) => `${Number(n ?? 0).toFixed(2)}%`;

function RevenueTab() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["revenue"], queryFn: getRevenue });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status">
        <span className="sr-only">Loading revenue…</span>
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="cs-card h-28 animate-pulse" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
        Could not load revenue: {error?.response?.data?.error || error?.message}
      </div>
    );
  }

  const d = data || {};
  const tiers = d.byTier || [];
  const ex = d.excluded || {};
  const diag = d.diagnostics || {};
  const dataGaps = (diag.unknownInterval || 0) + (diag.unknownPlan || 0) + (ex.other?.count || 0);

  return (
    <div className="space-y-8">
      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <RevStat label="MRR (gross, VAT incl.)" value={eur(d.mrrGross)} sub={`net ≈ ${eur(d.mrrNet)}`} accent />
        <RevStat label="ARR (gross)"            value={eur(d.arrGross)} sub={`net ≈ ${eur(d.arrNet)}`} />
        <RevStat label="Active subscriptions"   value={d.paidSubscriptions ?? 0}
                 sub={`${d.paidServers ?? 0} server · ${d.paidAgencies ?? 0} agency`} />
        <RevStat label="ARPU (gross)"           value={eur(d.arpuGross)} sub={`net ≈ ${eur(d.arpuNet)} · per paid subscription`} />
        <RevStat label={`Churn ${d.churn?.windowDays ?? 30}d`} value={pct(d.churn?.rate)}
                 sub={`${d.churn?.canceled ?? 0} canceled / ${(d.churn?.activeNow ?? 0) + (d.churn?.canceled ?? 0)} base`} />
        <RevStat label="Active trials"          value={d.trials?.active ?? 0}
                 sub={`${d.trials?.used ?? 0} trials ever used`} />
        <RevStat label="Trial → paid"           value={pct(d.trials?.conversionRate)}
                 sub={`${d.trials?.converted ?? 0} of ${d.trials?.used ?? 0} (historical)`} />
        <RevStat label="Cash collected (month)" value={eur(d.cashCollectedThisMonth)}
                 sub="paid invoices this calendar month — not MRR" />
      </div>

      {/* Not in MRR */}
      <div className="cs-card">
        <h2 className="cs-heading font-display font-bold text-cs-text text-xl">Not counted in MRR</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <RevStat label="Trialing (Stripe)" value={ex.trialing?.count ?? 0} sub={`${eur(ex.trialing?.potentialMrr)} potential`} />
          <RevStat label="Gifted (manual)"   value={ex.gifted?.count ?? 0}   sub={`${eur(ex.gifted?.listValue)} list value given away`} />
          <RevStat label="Past due"          value={ex.pastDue?.count ?? 0}  sub={`${eur(ex.pastDue?.atRiskMrr)} at risk`} />
          <RevStat label="Discord billed"    value={ex.discord?.count ?? 0}  sub={`${eur(ex.discord?.listValue)} outside Stripe`} />
        </div>
      </div>

      {/* Per-tier table */}
      <div className="cs-card p-0 overflow-hidden">
        <table className="cs-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="text-right">Subs</th>
              <th className="text-right">Monthly</th>
              <th className="text-right">Yearly</th>
              <th className="text-right">MRR (gross)</th>
              <th className="text-right">MRR (net ≈)</th>
              <th className="text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 ? (
              <tr><td colSpan={7} className="text-cs-dim text-sm">No active paid subscriptions yet.</td></tr>
            ) : tiers.map((t) => (
              <tr key={t.plan}>
                <td>
                  <span className="text-cs-text font-medium">{t.label}</span>
                  <span className="font-mono text-[10px] text-cs-dim ml-2">{t.plan}</span>
                </td>
                <td className="text-right font-mono text-xs text-cs-muted">{t.count}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{t.monthlyCount} · {eur(t.monthlyMrr)}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{t.yearlyCount} · {eur(t.yearlyMrr)}</td>
                <td className="text-right font-display font-bold text-cs-cyan">{eur(t.mrr)}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{eur(t.mrr / (1 + (d.vatRate ?? 0.2)))}</td>
                <td className="text-right font-mono text-xs text-cs-dim">
                  {d.mrrGross > 0 ? pct((t.mrr / d.mrrGross) * 100) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {tiers.length > 0 && (
            <tfoot>
              <tr>
                <td className="text-cs-text font-semibold">Total</td>
                <td className="text-right font-mono text-xs text-cs-muted">{d.paidSubscriptions}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{d.interval?.monthlyCount} · {eur(d.interval?.monthlyMrr)}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{d.interval?.yearlyCount} · {eur(d.interval?.yearlyMrr)}</td>
                <td className="text-right font-display font-bold text-cs-cyan">{eur(d.mrrGross)}</td>
                <td className="text-right font-mono text-xs text-cs-muted">{eur(d.mrrNet)}</td>
                <td className="text-right font-mono text-xs text-cs-dim">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Data gaps — мълчаливо изкривяване на числата е по-лошо от липсващо число */}
      {dataGaps > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning space-y-1" role="status">
          <div className="font-mono uppercase tracking-wider">⚠ Data gaps affecting the numbers</div>
          {diag.unknownInterval > 0 && <div>{diag.unknownInterval} active subscription(s) without a billing interval — counted as monthly.</div>}
          {diag.unknownPlan > 0 && <div>{diag.unknownPlan} subscription(s) on an unpriced plan — excluded entirely.</div>}
          {ex.other?.count > 0 && <div>{ex.other.count} row(s) in another Stripe status (unpaid / disputed / refunded / unknown) — excluded.</div>}
          {diag.grandfathered > 0 && <div>{diag.grandfathered} grandfathered row(s) without a plan, priced as White-label.</div>}
        </div>
      )}

      {/* Methodology */}
      <div className="cs-card text-xs text-cs-muted leading-relaxed space-y-2">
        <h2 className="cs-heading font-display font-bold text-cs-text text-xl">Methodology</h2>
        <p>
          MRR is derived from <strong className="text-cs-text">subscription state</strong> (Server + Agency), not from
          the payment log: monthly plans at full list price, annual plans at price ÷ 12. Only
          <code className="font-mono text-cs-cyan"> stripeStatus = active</code> counts.
        </p>
        <p>
          Trialing, manually gifted, past-due and Discord-billed subscriptions are reported separately and are
          <strong className="text-cs-text"> not</strong> in MRR. Agency-covered servers stay on plan
          <code className="font-mono"> free</code>, so a seat is never billed twice — the agency subscription carries it.
        </p>
        <p>
          Prices are list prices in <strong className="text-cs-text">EUR with VAT included</strong>; net is an
          approximation (÷ 1.20, BG rate). Under EU OSS the rate follows the customer's country — the exact net/VAT
          split is in the Stripe Tax report. Coupons and prorations are not reflected.
        </p>
        <p>
          Churn is approximate: cancellations are dated by <code className="font-mono">updatedAt</code>, not by an exact
          cancellation timestamp; deleted servers are not counted. Trial conversion is historical
          (ever-trialed vs. premium now), not cohort-based.
        </p>
        <p className="text-cs-dim">
          Generated {d.generatedAt ? new Date(d.generatedAt).toLocaleString() : "—"} · authoritative figures live in the
          Stripe Dashboard.
        </p>
      </div>
    </div>
  );
}

function RevStat({ label, value, sub, accent }) {
  return (
    <div className="cs-stat">
      <div className="cs-stat-label">{label}</div>
      <div className={`cs-stat-value ${accent ? "text-cs-cyan" : ""}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-cs-dim mt-1">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS (with CRUD)
// ═══════════════════════════════════════════════════════════════════════════════

function UsersTab() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["adminUsers", query, roleFilter],
    queryFn: () => getAdminUsers({ query, role: roleFilter || undefined, limit: 100 }),
  });

  const deleteUser = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      setConfirmDelete(null);
    },
  });

  return (
    <>
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim" aria-hidden="true" />
          <input
            className="cs-input pl-10"
            placeholder="Search by username or Discord ID..."
            aria-label="Search users by username or Discord ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="cs-select max-w-[200px]" aria-label="Filter users by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="MAIN_OWNER">Main Owner</option>
          <option value="SUPER_USER">Super User</option>
          <option value="SUPPORT_STAFF">Support Staff</option>
          <option value="USER">User</option>
        </select>
      </div>

      <div className="cs-card p-0 overflow-hidden">
        <table className="cs-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Servers</th>
              <th>Tickets</th>
              <th>Joined</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={7}><div className="h-8 bg-cs-panel/50 animate-pulse" /></td></tr>
              ))
            ) : (data?.users || []).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatar
                        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=32`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`}
                      className="w-8 h-8 border border-cs-border" alt=""
                    />
                    <div>
                      <div className="text-cs-text font-medium">{u.username}</div>
                      <div className="font-mono text-[10px] text-cs-dim">{u.id}</div>
                    </div>
                  </div>
                </td>
                <td><span className={ROLE_COLORS[u.globalRole] || "cs-badge-muted"}>{u.globalRole}</span></td>
                <td>
                  {u.isBlacklisted
                    ? <span className="cs-badge-danger">Blacklisted</span>
                    : <span className="cs-badge-success">Active</span>}
                </td>
                <td className="text-cs-muted font-mono text-xs">{u._count?.serverMembers ?? 0}</td>
                <td className="text-cs-muted font-mono text-xs">{u._count?.tickets ?? 0}</td>
                <td className="text-cs-dim text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setSelectedUserId(u.id)} className="cs-btn-ghost cs-btn-sm" title="Edit user" aria-label={`Edit user ${u.username}`}>
                      <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {u.globalRole !== "MAIN_OWNER" && (
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="cs-btn-ghost cs-btn-sm text-danger hover:bg-danger/10"
                        title="Delete user"
                        aria-label={`Delete user ${u.username}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUserId && <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}

      {confirmDelete && (
        <ConfirmModal
          title="Delete User Account"
          message={`Permanently delete "${confirmDelete.username}"? This cannot be undone. If the user has tickets or applications, deletion will be refused — use Blacklist instead.`}
          confirmLabel="Delete Permanently"
          onConfirm={() => deleteUser.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          loading={deleteUser.isPending}
          error={deleteUser.error?.response?.data?.error}
          danger
        />
      )}
    </>
  );
}

function UserDetailModal({ userId, onClose }) {
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ["adminUser", userId],
    queryFn: () => getAdminUser(userId),
  });

  const setRole = useMutation({
    mutationFn: ({ role }) => api.patch(`/admin/users/${userId}/role?confirm=true`, { role }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      qc.invalidateQueries({ queryKey: ["adminUser", userId] });
    },
  });

  const setBlacklist = useMutation({
    mutationFn: ({ blacklisted }) => api.patch(`/admin/users/${userId}/blacklist?confirm=true`, { blacklisted }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      qc.invalidateQueries({ queryKey: ["adminUser", userId] });
    },
  });

  return (
    <Modal open onClose={onClose} title="Edit User" maxWidth="max-w-2xl">
      {isLoading ? (
          <div className="h-40 animate-pulse bg-cs-panel" role="status">
            <span className="sr-only">Loading user…</span>
          </div>
        ) : user ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 pb-4 border-b border-cs-border">
              <img src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/0.png`}
                   className="w-16 h-16 border border-cs-cyan/40" alt="" />
              <div>
                <div className="font-bold text-cs-text text-lg">{user.username}</div>
                <div className="font-mono text-xs text-cs-dim">{user.id}</div>
                <div className="font-mono text-[10px] text-cs-dim mt-1">
                  Joined: {new Date(user.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {user.globalRole !== "MAIN_OWNER" && (
              <>
                <div>
                  <label className="cs-label">Global Role</label>
                  <div className="flex gap-2 flex-wrap">
                    {["USER", "SUPPORT_STAFF", "SUPER_USER"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setRole.mutate({ role: r })}
                        disabled={setRole.isPending || user.globalRole === r}
                        className={user.globalRole === r
                          ? "cs-btn-primary cs-btn-sm cursor-default"
                          : "cs-btn-secondary cs-btn-sm"}
                      >
                        {r.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="cs-label">Blacklist Status</label>
                  {user.isBlacklisted ? (
                    <button
                      className="cs-btn-secondary cs-btn-sm"
                      onClick={() => setBlacklist.mutate({ blacklisted: false })}
                      disabled={setBlacklist.isPending}
                    >
                      <CheckCircle className="w-4 h-4" /> Remove from blacklist
                    </button>
                  ) : (
                    <button
                      className="cs-btn-danger cs-btn-sm"
                      onClick={() => setBlacklist.mutate({ blacklisted: true })}
                      disabled={setBlacklist.isPending}
                    >
                      <Ban className="w-4 h-4" /> Add to blacklist
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cs-border">
              <div><div className="cs-label">Servers</div><div className="font-display text-2xl font-bold text-cs-cyan">{user.serverMembers?.length ?? 0}</div></div>
              <div><div className="cs-label">Tickets</div><div className="font-display text-2xl font-bold">{user.tickets?.length ?? 0}</div></div>
              <div><div className="cs-label">Payments</div><div className="font-display text-2xl font-bold">{user.payments?.length ?? 0}</div></div>
            </div>
          </div>
        ) : null}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVERS (full CRUD)
// ═══════════════════════════════════════════════════════════════════════════════

// Всички ръчно задаваеми планове (PLANS в backend/src/lib/premium.js).
const PLAN_OPTIONS = [
  { value: "free",       label: "Free",        note: "Revokes all premium features (base limits)." },
  { value: "premium",    label: "Premium",     note: "Unlimited panels/forms, AI replies, round-robin, webhooks, API." },
  { value: "whitelabel", label: "White-label", note: "Premium + custom bot under the customer's own brand." },
  { value: "agency5",    label: "Agency 5",    note: "White-label for up to 5 servers — creates a manual Agency owned by the server owner; they attach the other servers themselves." },
  { value: "agency10",   label: "Agency 10",   note: "White-label for up to 10 servers — creates a manual Agency owned by the server owner; they attach the other servers themselves." },
];

// Кратък етикет за Plan колоната.
const PLAN_BADGE = { premium: "Premium", whitelabel: "White-label", agency5: "Agency 5", agency10: "Agency 10" };

function ServersTab() {
  const qc = useQueryClient();
  const [confirmPlan, setConfirmPlan] = useState(null); // { server }
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [editServer, setEditServer] = useState(null);
  const [broadcastServer, setBroadcastServer] = useState(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["adminServers"],
    queryFn: () => getAdminServers({ limit: 100 }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["adminServers"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
  };

  const setPlanMut = useMutation({
    mutationFn: ({ serverId, plan, reason }) => setServerPlan(serverId, plan, reason),
    onSuccess: () => { invalidate(); setConfirmPlan(null); setReason(""); },
  });

  const delServer = useMutation({
    mutationFn: deleteAdminServer,
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
  });

  const resetServer = useMutation({
    mutationFn: resetAdminServer,
    onSuccess: () => { invalidate(); setConfirmReset(null); },
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="text-cs-muted text-sm font-mono">
          → {data?.total ?? 0} total servers
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-cs-dim">
          Grant • Revoke • Edit • Broadcast • Reset • Delete
        </div>
      </div>

      <div className="cs-card p-0 overflow-hidden">
        <table className="cs-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>Plan</th>
              <th>Tickets</th>
              <th>Panels</th>
              <th>Forms</th>
              <th>Added</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={7}><div className="h-10 bg-cs-panel/50 animate-pulse" /></td></tr>
              ))
            ) : (data?.servers || []).map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-3">
                    {s.icon
                      ? <img src={`https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png?size=32`} className="w-8 h-8 border border-cs-border" alt="" />
                      : <div className="w-8 h-8 border border-cs-border bg-cs-panel flex items-center justify-center text-xs font-bold text-cs-cyan">{s.name[0]}</div>}
                    <div>
                      <div className="text-cs-text font-medium">{s.name}</div>
                      <div className="font-mono text-[10px] text-cs-dim">{s.id}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {s.agencyId
                    ? <span className="cs-badge-premium"><Star className="w-3 h-3" aria-hidden="true" /> Agency seat</span>
                    : s.plan && s.plan !== "free"
                      ? s.planSource === "manual"
                        ? <span className="cs-badge-manual"><Sparkles className="w-3 h-3" aria-hidden="true" /> {PLAN_BADGE[s.plan] || s.plan} · manual</span>
                        : <span className="cs-badge-premium"><Star className="w-3 h-3" aria-hidden="true" /> {PLAN_BADGE[s.plan] || s.plan}</span>
                      : s.isPremium
                        ? <span className="cs-badge-premium"><Star className="w-3 h-3" aria-hidden="true" /> Premium</span>
                        : <span className="cs-badge-muted">Base</span>}
                </td>
                <td className="text-cs-muted font-mono text-xs">{s._count.tickets}</td>
                <td className="text-cs-muted font-mono text-xs">{s._count.panels}</td>
                <td className="text-cs-muted font-mono text-xs">{s._count.forms ?? 0}</td>
                <td className="text-cs-dim text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="text-right">
                  <div className="flex gap-1 justify-end items-center">
                    <button
                      onClick={() => {
                        setSelectedPlan(s.agencyId ? "agency5" : (s.plan && s.plan !== "free" ? s.plan : "premium"));
                        setConfirmPlan({ server: s });
                      }}
                      className="cs-btn-sm text-premium hover:bg-premium/10 border border-premium/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
                      title="Change plan"
                      aria-label={`Change plan for ${s.name}`}
                    >✦ Plan</button>
                    <button onClick={() => setEditServer(s)}       className="cs-btn-ghost cs-btn-sm" title="Edit" aria-label={`Edit ${s.name}`}><Edit className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    <button onClick={() => setBroadcastServer(s)}  className="cs-btn-ghost cs-btn-sm" title="Broadcast" aria-label={`Broadcast to ${s.name}`}><MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    <button onClick={() => setConfirmReset(s)}     className="cs-btn-ghost cs-btn-sm text-warning hover:bg-warning/10" title="Reset" aria-label={`Reset ${s.name}`}><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    <button onClick={() => setConfirmDelete(s)}    className="cs-btn-ghost cs-btn-sm text-danger hover:bg-danger/10" title="Delete" aria-label={`Delete ${s.name}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmPlan && (
        <ConfirmModal
          title="Change plan"
          danger={selectedPlan === "free"}
          confirmLabel={selectedPlan === "free" ? "Revoke (set Free)" : `✦ Set ${PLAN_OPTIONS.find((p) => p.value === selectedPlan)?.label}`}
          onCancel={() => { setConfirmPlan(null); setReason(""); }}
          onConfirm={() => setPlanMut.mutate({ serverId: confirmPlan.server.id, plan: selectedPlan, reason })}
          loading={setPlanMut.isPending}
          error={setPlanMut.error?.response?.data?.error}
        >
          <div className="mb-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-cs-dim">Server</div>
            <div className="font-semibold text-cs-text">{confirmPlan.server.name}</div>
            <div className="font-mono text-[10px] text-cs-dim">{confirmPlan.server.id}</div>
          </div>

          <label className="cs-label">Plan (manual, no Stripe charge — excluded from MRR)</label>
          <select className="cs-input mb-2" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
            {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <div className={`border px-3 py-2 text-xs mb-4 ${selectedPlan === "free" ? "border-danger/40 bg-danger/5 text-danger" : "border-premium/40 bg-premium/5 text-premium"}`}>
            {PLAN_OPTIONS.find((p) => p.value === selectedPlan)?.note}
            {selectedPlan === "free" && " Active Stripe subscription (if any) stays active — cancel it in Stripe first."}
          </div>

          <label className="cs-label">Reason (optional, audit-logged)</label>
          <input className="cs-input" placeholder={selectedPlan === "free" ? "e.g. Terms violation" : "e.g. Partnership, sponsor deal"} value={reason} onChange={(e) => setReason(e.target.value)} />
        </ConfirmModal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Server"
          danger
          confirmLabel="Permanently Delete"
          onConfirm={() => delServer.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          loading={delServer.isPending}
          error={delServer.error?.response?.data?.error}
          message={`Permanently delete "${confirmDelete.name}" and ALL its panels, forms, tickets, applications, audit logs, payment logs? This cannot be undone. The bot will remain in the Discord guild until manually removed.`}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reset Server Data"
          danger
          confirmLabel="Reset Everything"
          onConfirm={() => resetServer.mutate(confirmReset.id)}
          onCancel={() => setConfirmReset(null)}
          loading={resetServer.isPending}
          error={resetServer.error?.response?.data?.error}
          message={`Delete ALL panels, forms, tickets, applications for "${confirmReset.name}" but keep the server record and Premium status? Useful for a clean slate.`}
        />
      )}

      {editServer && <EditServerModal server={editServer} onClose={() => setEditServer(null)} />}
      {broadcastServer && <BroadcastModal server={broadcastServer} onClose={() => setBroadcastServer(null)} />}
    </>
  );
}

function EditServerModal({ server, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    logChannelId:         server.logChannelId || "",
    archiveChannelId:     server.archiveChannelId || "",
    archiveRetentionDays: server.archiveRetentionDays ?? 30,
    customBotName:        server.customBotName || "",
    customBotAvatar:      server.customBotAvatar || "",
  });

  const update = useMutation({
    mutationFn: (data) => updateAdminServer(server.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adminServers"] }); onClose(); },
  });

  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Modal open onClose={onClose} title={`Edit Server — ${server.name}`} maxWidth="max-w-2xl">
      <div className="font-mono text-[10px] text-cs-dim mb-4">{server.id}</div>

        <div className="space-y-4">
          <div>
            <label className="cs-label">Log Channel ID</label>
            <input className="cs-input font-mono text-xs" placeholder="Discord channel ID" {...field("logChannelId")} />
          </div>
          <div>
            <label className="cs-label">Archive Channel ID</label>
            <input className="cs-input font-mono text-xs" placeholder="Where closed ticket archives post" {...field("archiveChannelId")} />
          </div>
          <div>
            <label className="cs-label">Archive Retention (days)</label>
            <input className="cs-input" type="number" min="0" {...field("archiveRetentionDays")} />
            <p className="text-xs text-cs-dim mt-1">0 = forever (Premium default)</p>
          </div>
          <div>
            <label className="cs-label">Custom Bot Name (Premium white-label)</label>
            <input className="cs-input" placeholder="MySupport Bot" {...field("customBotName")} />
          </div>
          <div>
            <label className="cs-label">Custom Bot Avatar URL</label>
            <input className="cs-input font-mono text-xs" placeholder="https://..." {...field("customBotAvatar")} />
          </div>
        </div>

        {update.isError && (
          <p className="mt-4 text-xs text-danger" role="alert">Error: {update.error?.response?.data?.error || update.error.message}</p>
        )}

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-cs-border">
          <button className="cs-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="cs-btn-primary"
            disabled={update.isPending}
            onClick={() => update.mutate({
              ...form,
              archiveRetentionDays: Number(form.archiveRetentionDays) || 0,
            })}
          >{update.isPending ? "Saving..." : "Save Changes"}</button>
        </div>
    </Modal>
  );
}

function BroadcastModal({ server, onClose }) {
  const [channelId, setChannelId] = useState(server.logChannelId || "");
  const [title, setTitle] = useState("Platform Notice");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: () => broadcastToServer(server.id, channelId, title, message),
    onSuccess: () => onClose(),
  });

  return (
    <Modal open onClose={onClose} title={`Send Notice to ${server.name}`} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="cs-label">Discord Channel ID</label>
            <input className="cs-input font-mono text-xs" placeholder="Channel where embed should post" value={channelId} onChange={(e) => setChannelId(e.target.value)} />
            <p className="text-xs text-cs-dim mt-1">Bot must have Send Messages permission there.</p>
          </div>
          <div>
            <label className="cs-label">Title</label>
            <input className="cs-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="cs-label">Message (Markdown)</label>
            <textarea className="cs-textarea" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Maintenance window 2am–3am UTC..." />
          </div>
        </div>

        {send.isError && (
          <p className="mt-4 text-xs text-danger" role="alert">Error: {send.error?.response?.data?.error || send.error.message}</p>
        )}

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-cs-border">
          <button className="cs-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="cs-btn-primary" disabled={send.isPending || !channelId || !message} onClick={() => send.mutate()}>
            {send.isPending ? "Sending..." : "Send Broadcast"}
          </button>
        </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENTS (with delete for manual grants)
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentsTab() {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["payments"], queryFn: () => getPayments({ limit: 100 }) });

  const del = useMutation({
    mutationFn: deleteAdminPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      setConfirmDelete(null);
    },
  });

  const payments = data?.payments || [];
  // КАСА, не MRR: сумата на реално платените фактури този календарен месец.
  // (Полето по-рано се казваше `mrr` — виж routes/admin.js, секция REVENUE.)
  const collected = data?.collectedThisMonth || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="font-mono text-sm text-cs-muted">→ {data?.total ?? 0} transactions</div>
        <div className="cs-card py-2 px-4 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-wider text-cs-dim mr-2">Cash collected (this month)</span>
          <span className="font-display font-bold text-cs-cyan text-lg">{eur(collected)}</span>
          <span className="font-mono text-[10px] text-cs-dim ml-2">not MRR → Revenue tab</span>
        </div>
      </div>

      <div className="cs-card p-0 overflow-hidden">
        <table className="cs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Server</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Description</th>
              <th>Invoice</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <tr key={i}><td colSpan={7}><div className="h-8 bg-cs-panel/50 animate-pulse"/></td></tr>)
            ) : payments.map((p) => (
              <tr key={p.id}>
                <td className="text-xs text-cs-muted">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="font-mono text-[10px] text-cs-dim">{p.serverId}</td>
                <td className="font-display font-bold">{(p.amount / 100).toFixed(2)} <span className="text-xs text-cs-dim uppercase">{p.currency}</span></td>
                <td>
                  {p.status === "paid"         ? <span className="cs-badge-success">Paid</span>
                  : p.status === "failed"      ? <span className="cs-badge-danger">Failed</span>
                  : p.status === "manual_grant"? <span className="cs-badge-manual">Manual</span>
                                                : <span className="cs-badge-muted">{p.status}</span>}
                </td>
                <td className="text-cs-muted text-xs">{p.description || "—"}</td>
                <td className="font-mono text-[10px] text-cs-dim">{p.stripeInvoiceId || "—"}</td>
                <td className="text-right">
                  {!p.stripeInvoiceId && (
                    <button onClick={() => setConfirmDelete(p)}
                            className="cs-btn-ghost cs-btn-sm text-danger hover:bg-danger/10"
                            title="Delete manual entry"
                            aria-label="Delete manual payment log entry">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Payment Log"
        message="Delete this manual payment log? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => confirmDelete && del.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG (with purge)
// ═══════════════════════════════════════════════════════════════════════════════

function AuditTab() {
  const qc = useQueryClient();
  const [actionFilter, setActionFilter] = useState("");
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);

  const { data, isLoading } = useQuery({
    queryKey: ["auditLogs", actionFilter],
    queryFn: () => getAuditLogs({ limit: 200, action: actionFilter || undefined }),
  });

  const purge = useMutation({
    mutationFn: purgeAuditLogs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auditLogs"] });
      setConfirmPurge(false);
    },
  });

  const logs = data?.logs || [];

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="font-mono text-sm text-cs-muted flex-1">→ {data?.total ?? 0} log entries</div>
        <input
          className="cs-input max-w-[200px]"
          placeholder="Filter by action..."
          aria-label="Filter audit log by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <button className="cs-btn-danger cs-btn-sm" onClick={() => setConfirmPurge(true)}>
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Purge Old
        </button>
      </div>

      <div className="cs-card p-0 overflow-hidden">
        <table className="cs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 12 }).map((_, i) => <tr key={i}><td colSpan={5}><div className="h-6 bg-cs-panel/50 animate-pulse"/></td></tr>)
            ) : logs.map((log) => (
              <tr key={log.id}>
                <td className="text-xs font-mono text-cs-dim whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="text-xs">{log.actor?.username || log.actorTag || <span className="text-cs-dim italic">—</span>}</td>
                <td><span className="font-mono text-[10px] uppercase tracking-wider text-cs-cyan">{log.action}</span></td>
                <td className="font-mono text-[10px] text-cs-dim">{log.targetId || "—"}</td>
                <td className="text-xs text-cs-muted max-w-md truncate" title={JSON.stringify(log.metadata)}>
                  {log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmPurge && (
        <ConfirmModal
          title="Purge Audit Logs"
          danger
          confirmLabel={`Purge logs older than ${purgeDays} days`}
          onCancel={() => setConfirmPurge(false)}
          onConfirm={() => purge.mutate(Number(purgeDays))}
          loading={purge.isPending}
          error={purge.error?.response?.data?.error}
        >
          <p className="text-sm text-cs-muted mb-4">
            Destructive entries (user deletions, blacklists, role changes, server deletions, Premium grants) are <strong className="text-cs-text">always preserved</strong> regardless of age.
          </p>
          <label className="cs-label">Delete logs older than (days, minimum 30)</label>
          <input type="number" min="30" className="cs-input" value={purgeDays} onChange={(e) => setPurgeDays(e.target.value)} />
        </ConfirmModal>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC CONFIRM MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmModal({ title, message, children, confirmLabel, onConfirm, onCancel, loading, error, danger }) {
  return (
    <Modal open onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 border flex items-center justify-center ${danger ? "border-danger text-danger" : "border-cs-cyan text-cs-cyan"}`}>
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        {danger && <span className="sr-only">Warning</span>}
      </div>

      {message && <p className="text-sm text-cs-muted leading-relaxed mb-4">{message}</p>}
      {children}

      {error && (
        <div className="border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger mt-3" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-cs-border">
        <button className="cs-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
        <button
          className={danger ? "cs-btn-danger" : "cs-btn-primary"}
          disabled={loading}
          onClick={onConfirm}
        >{loading ? "Working..." : confirmLabel}</button>
      </div>
    </Modal>
  );
}
