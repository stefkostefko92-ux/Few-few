// frontend/src/pages/AdminOpsTabs.jsx
// Админ конзола (EN-only, изключена от i18n) — операционните табове v3.4:
// System · Security · Billing · Fleet · Compliance (DSR). Данните идват от
// routes/adminOps.js; всяко променящо действие там иска MAIN_OWNER + свеж
// втори фактор (step-up) — при 403 MFA_STEP_UP интерсепторът отваря
// предизвикателството (MfaGate) и човекът повтаря действието.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ShieldCheck, ShieldAlert, KeyRound, Ban, RefreshCw, Trash2, Search, Server, CreditCard, Bot, FileText, AlertTriangle, Sparkles, Plus,
} from "lucide-react";
import {
  getAdminSystem, getAdminSecurity, adminUnblock, adminRevokeApiKey, getAdminBilling, adminReconcileBilling,
  getAdminFleet, adminReconcileFleet, getAdminFleetBots, adminFleetAction, adminFleetBranding, adminFleetRemoveToken, getDsrRequests, getDsrSummary, dsrErase, adminResetUserMfa,
  getAdminGameSeason, createAdminGameSeason, updateAdminGameSeason, deleteAdminGameSeason,
} from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import { toUtcInput, fromUtcInput } from "../utils/utcDateInput";

const adminErr = (err) => {
  const d = err?.response?.data;
  if (d?.code === "MFA_STEP_UP") return "Confirm your second factor (dialog opened), then repeat the action.";
  return d?.error || "Action failed. Please try again.";
};
export const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
const ago = (d) => {
  if (!d) return "never";
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3600000);
  return h < 1 ? `${Math.floor(ms / 60000)} min ago` : h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

export function Tile({ label, value, sub, ok }) {
  // Думи като „configured“/„connected“/„v49_user_mfa“ в text-4xl излизаха извън
  // картата на телефон (визуален одит 25.09.2026) — дългите стойности са по-малки
  // и се пренасят, числата остават големи.
  const long = String(value ?? "").length > 6;
  return (
    <div className="cs-stat min-w-0">
      <div className="cs-stat-label">{label}</div>
      <div className={`cs-stat-value break-words ${long ? "!text-2xl sm:!text-3xl" : ""} ${ok === true ? "text-success" : ok === false ? "text-danger" : ""}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-cs-dim mt-1 break-all">{sub}</div>}
    </div>
  );
}
export function Section({ title, icon: Icon, children, right }) {
  return (
    <div className="cs-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="cs-heading font-display font-bold text-cs-text text-xl flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-cs-cyan" />} {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}
export const Loading = () => <div className="cs-card h-40 animate-pulse" role="status"><span className="sr-only">Loading…</span></div>;
// Без него провалена заявка рендерираше `data || {}` като „DOWN“ / „no“ / нули —
// лъжливо състояние вместо честна грешка (одит 26.09.2026).
export function LoadError({ error, onRetry }) {
  const msg = error?.response?.data?.error || error?.message || "Request failed";
  return (
    <div className="cs-card border-danger/40" role="alert">
      <p className="text-sm text-danger flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> Could not load this tab: {msg}</p>
      {onRetry && <button type="button" className="cs-btn-secondary cs-btn-sm mt-3" onClick={() => onRetry()}><RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry</button>}
    </div>
  );
}
const Bool = ({ v }) => <span className={v ? "text-success" : "text-danger"}>{v ? "yes" : "no"}</span>;

// ═══ SYSTEM ═══════════════════════════════════════════════════════════════════
export function SystemTab() {
  const { data, isLoading, isError, error: loadError, refetch, isFetching } = useQuery({ queryKey: ["admin-system"], queryFn: getAdminSystem, refetchInterval: 30000 });
  if (isLoading) return <Loading />;
  if (isError) return <LoadError error={loadError} onRetry={refetch} />;
  const d = data || {};
  const jobs = Object.entries(d.jobs || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Database" value={d.db?.ok ? "up" : "DOWN"} ok={!!d.db?.ok} sub={d.db?.ok ? `${d.db.latencyMs} ms` : d.db?.error} />
        <Tile label="Redis" value={d.redis?.ok ? "up" : d.redis?.configured ? "DOWN" : "not configured"} ok={d.redis?.ok ? true : d.redis?.configured ? false : undefined} sub={d.redis?.ok ? `${d.redis.latencyMs} ms` : "brute-force + rate limits fall back to memory"} />
        <Tile label="Bot gateway" value={d.bot?.gateway || (d.bot?.ok ? "ok" : "DOWN")} ok={!!d.bot?.ok}
              sub={d.bot?.brandBots ? `brand bots ${d.bot.brandBots.ready}/${d.bot.brandBots.total}${d.bot.brandBots.down ? ` · ${d.bot.brandBots.down} down` : ""}` : d.bot?.error} />
        <Tile label="Backend" value={`v${d.backend?.version}`} sub={`${d.backend?.node} · up ${Math.floor((d.backend?.uptimeSec || 0) / 3600)} h · ${d.backend?.env}`} />
        <Tile label="Migration" value={d.migration?.latest ? d.migration.latest.replace(/^\d+_/, "") : "?"} ok={d.migration?.pending === 0} sub={d.migration?.pending ? `${d.migration.pending} pending!` : `applied ${fmt(d.migration?.finishedAt)}`} />
        <Tile label="Billing" value={d.billing?.provider} ok={d.billing?.discordConfigured} sub={d.billing?.discordConfigured ? "Discord store configured" : "SKU / client id missing"} />
        <Tile label="MFA enforced" value={d.config?.mfaEnforced ? "yes" : "NO"} ok={!!d.config?.mfaEnforced} sub="staff must enroll + verify" />
        <Tile label="AI replies" value={d.config?.gemini ? (d.config.aiTrainingAttested ? "on" : "BLOCKED") : "off"} ok={d.config?.gemini ? d.config.aiTrainingAttested : undefined}
              sub={d.config?.gemini && !d.config.aiTrainingAttested ? "Developer Policy §21: attest paid tier (AI_REPLY_TRAINING_ATTESTED)" : "Discord content never trains models"} />
      </div>
      <Section title="Scheduled jobs — last heartbeat" icon={Activity}
        right={<button onClick={() => refetch()} className="cs-btn-secondary text-xs flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh</button>}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Job</th><th>Last OK</th><th>Last failure</th></tr></thead><tbody>
          {jobs.length === 0 && <tr><td colSpan={3} className="text-cs-dim">No heartbeats yet — the audit log fills as jobs run.</td></tr>}
          {jobs.map(([name, j]) => {
            const stale = !j.lastOk || Date.now() - new Date(j.lastOk).getTime() > 2 * 24 * 3600000;
            return <tr key={name}><td className="font-mono text-xs">{name}</td><td className={stale ? "text-warning" : ""}>{ago(j.lastOk)}</td><td className={j.lastFail && (!j.lastOk || new Date(j.lastFail) > new Date(j.lastOk)) ? "text-danger" : "text-cs-dim"}>{ago(j.lastFail)}</td></tr>;
          })}
        </tbody></table></div>
      </Section>
      <Section title="Outbound webhooks — failing deliveries" icon={AlertTriangle}>
        {!d.webhooks?.failing ? <p className="text-sm text-cs-dim">No webhook has failed deliveries.</p> : (
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Server</th><th>Webhook</th><th>Failures</th><th>Last status</th><th>Last delivery</th><th>Enabled</th></tr></thead><tbody>
            {(d.webhooks.items || []).map((w) => <tr key={w.id}><td className="font-mono text-[10px]">{w.serverId}</td><td>{w.name}</td><td className="text-danger">{w.failCount}</td><td className="font-mono text-xs">{w.lastStatus ?? "—"}</td><td className="text-xs">{ago(w.lastDeliveryAt)}</td><td><Bool v={w.enabled} /></td></tr>)}
          </tbody></table></div>
        )}
        <p className="font-mono text-[10px] text-cs-dim mt-2">{d.webhooks?.failing ?? 0} webhook(s) with failures across all servers · the operator sees the same on their Webhooks page.</p>
      </Section>
      <Section title="Configuration flags" icon={FileText}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <div>Admin IP allowlist: {d.config?.adminIpAllowlist?.enabled ? <span className="text-success">on ({d.config.adminIpAllowlist.entries} entries)</span> : <span className="text-cs-dim">off</span>}</div>
          <div>Security alerts (owner DM): <Bool v={d.config?.securityAlertsDm} /></div>
          <div>Transcripts encrypted at rest: <Bool v={d.config?.transcriptEncryption} /></div>
          <div>Sentry: <Bool v={d.config?.sentry} /></div>
          <div>Redis URL: <Bool v={d.config?.redisUrl} /></div>
          <div>Gemini key: <Bool v={d.config?.gemini} /></div>
          <div>Stripe legacy: <Bool v={d.billing?.stripeLegacy} /></div>
          <div className="col-span-2 md:col-span-3 font-mono text-xs text-cs-dim">FRONTEND_URL {d.config?.frontendUrl || "—"} · trust proxy {JSON.stringify(d.config?.trustProxy)}</div>
        </div>
      </Section>
    </div>
  );
}

// ═══ SECURITY ═════════════════════════════════════════════════════════════════
export function SecurityTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error: loadError, refetch } = useQuery({ queryKey: ["admin-security"], queryFn: getAdminSecurity, refetchInterval: 30000 });
  const [confirm, setConfirm] = useState(null);
  const unblockMut = useMutation({ mutationFn: ({ scope, key }) => adminUnblock(scope, key), onSuccess: () => { toast.success("Unblocked."); qc.invalidateQueries({ queryKey: ["admin-security"] }); }, onError: (e) => toast.error(adminErr(e)) });
  const revokeMut = useMutation({ mutationFn: adminRevokeApiKey, onSuccess: () => { toast.success("API key revoked."); qc.invalidateQueries({ queryKey: ["admin-security"] }); }, onError: (e) => toast.error(adminErr(e)) });
  const [resetTarget, setResetTarget] = useState(null); // { id, username }
  const [resetReason, setResetReason] = useState("");
  const resetMut = useMutation({ mutationFn: ({ id, reason }) => adminResetUserMfa(id, reason), onSuccess: (r) => { toast.success(`Second factor reset · ${r.sessionsRevoked} session(s) revoked.`); setResetTarget(null); setResetReason(""); qc.invalidateQueries({ queryKey: ["admin-security"] }); }, onError: (e) => toast.error(adminErr(e)) });
  if (isLoading) return <Loading />;
  if (isError) return <LoadError error={loadError} onRetry={refetch} />;
  const d = data || {};
  const noMfa = (d.staff || []).filter((s) => !s.mfaEnabled);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="MFA enforcement" value={d.mfaEnforced ? "on" : "OFF"} ok={!!d.mfaEnforced} />
        <Tile label="Staff without MFA" value={noMfa.length} ok={noMfa.length === 0} sub={noMfa.map((s) => s.username).join(", ") || "everyone enrolled"} />
        <Tile label="Live sessions" value={d.sessions?.total ?? 0} sub="express_sessions not expired" />
        <Tile label="Active blocks" value={d.bruteForce?.blocked?.length ?? 0} sub={`${d.bruteForce?.trackedEntries ?? 0} tracked · redis ${d.bruteForce?.redis ? "on" : "off"}`} />
      </div>
      <Section title="Staff accounts" icon={ShieldCheck}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>User</th><th>Role</th><th>MFA</th><th>Backup codes</th><th>Sessions</th><th></th></tr></thead><tbody>
          {(d.staff || []).map((s) => (
            <tr key={s.id}><td>{s.username} <span className="font-mono text-[10px] text-cs-dim">{s.id}</span></td><td className="font-mono text-xs">{s.globalRole}</td>
              <td>{s.mfaEnabled ? <span className="text-success">enabled {ago(s.mfaEnabledAt)}</span> : <span className="text-danger flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> missing</span>}</td>
              <td>{s.mfaEnabled ? s.backupCodesLeft : "—"}</td><td>{s.sessions}</td>
              <td>{s.mfaEnabled && <button onClick={() => { setResetTarget({ id: s.id, username: s.username }); setResetReason(""); }} className="text-warning text-xs flex items-center gap-1"><KeyRound className="w-3 h-3" /> Reset MFA</button>}</td></tr>
          ))}
        </tbody></table></div>
        <p className="font-mono text-[10px] text-cs-dim mt-2">Reset MFA = lost phone + lost backup codes. Clears the second factor, revokes the user's sessions, audits the reason and DMs the owner. Your own factor is managed only from Account security.</p>
        {resetTarget && (
          <form onSubmit={(e) => { e.preventDefault(); resetMut.mutate({ id: resetTarget.id, reason: resetReason }); }} className="mt-3 flex flex-wrap items-end gap-2 bg-cs-bg rounded-lg p-3">
            <span className="text-sm text-cs-text">Reset second factor for <strong>{resetTarget.username}</strong>:</span>
            <input className="cs-input !w-80" value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="reason (verified identity by voice call, ticket #…)" minLength={3} maxLength={300} required />
            <button type="submit" className="cs-btn-primary bg-warning border-warning text-black" disabled={resetMut.isPending || resetReason.trim().length < 3}>Confirm reset</button>
            <button type="button" onClick={() => setResetTarget(null)} className="cs-btn-secondary">Cancel</button>
          </form>
        )}
      </Section>
      <Section title="Brute-force blocks (this process)" icon={Ban}>
        {!d.bruteForce?.blocked?.length ? <p className="text-sm text-cs-dim">Nothing blocked right now.</p> : (
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Scope</th><th>Key</th><th>Failures</th><th>Until</th><th></th></tr></thead><tbody>
            {d.bruteForce.blocked.map((b) => (
              <tr key={`${b.scope}:${b.key}`}><td className="font-mono text-xs">{b.scope}</td><td className="font-mono text-xs">{b.label}</td><td>{b.failures}</td><td>{fmt(b.blockedUntil)}</td>
                <td><button onClick={() => setConfirm({ kind: "unblock", scope: b.scope, key: b.key, label: b.label })} className="cs-btn-secondary text-xs">Unblock</button></td></tr>
            ))}
          </tbody></table></div>
        )}
        <p className="font-mono text-[10px] text-cs-dim mt-2">Ladder: {(d.bruteForce?.steps || []).map((s) => `${s.failures}→${Math.round(s.blockMs / 60000)}m`).join(" · ")} · window {d.bruteForce?.windowSec}s. Redis-backed counters are shared across processes but listed only for this process.</p>
      </Section>
      <Section title="API keys (all servers)" icon={KeyRound}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Prefix</th><th>Name</th><th>Server</th><th>Scopes</th><th>Used</th><th>Last use</th><th>Status</th><th></th></tr></thead><tbody>
          {(d.apiKeys?.items || []).slice(0, 100).map((k) => (
            <tr key={k.id}><td className="font-mono text-xs">{k.keyPrefix}…</td><td>{k.name}</td><td className="font-mono text-[10px]">{k.serverId}</td><td className="text-xs">{(k.scopes || []).join(", ")}</td><td>{k.requestCount}</td><td className="text-xs">{ago(k.lastUsedAt)}</td>
              <td>{k.revokedAt ? <span className="text-cs-dim">revoked</span> : k.expiresAt && new Date(k.expiresAt) < new Date() ? <span className="text-warning">expired</span> : <span className="text-success">active</span>}</td>
              <td>{!k.revokedAt && <button onClick={() => setConfirm({ kind: "revoke", id: k.id, label: `${k.keyPrefix}… (${k.name})` })} className="text-danger text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Revoke</button>}</td></tr>
          ))}
        </tbody></table></div>
      </Section>
      <Section title="Security events — last 7 days" icon={AlertTriangle}>
        {!d.events?.length ? <p className="text-sm text-cs-dim">No security events.</p> : (
          <ul className="space-y-1 text-sm">
            {d.events.map((e) => <li key={e.id} className="flex gap-3"><span className="font-mono text-[10px] text-cs-dim w-36 flex-shrink-0">{fmt(e.createdAt)}</span><span className="font-mono text-xs text-cs-cyan">{e.action}</span><span className="text-cs-muted truncate">{e.actor?.username || e.actorTag || "—"} → {e.targetId}</span></li>)}
          </ul>
        )}
      </Section>
      <ConfirmDialog open={!!confirm} title={confirm?.kind === "unblock" ? "Unblock?" : "Revoke API key?"}
        message={confirm?.kind === "unblock" ? `Remove the block for ${confirm?.label} (${confirm?.scope}). The attacker can retry immediately.` : `Revoke ${confirm?.label}. Integrations using it stop working now. This cannot be undone.`}
        confirmLabel={confirm?.kind === "unblock" ? "Unblock" : "Revoke"} destructive
        loading={unblockMut.isPending || revokeMut.isPending}
        onConfirm={() => { confirm.kind === "unblock" ? unblockMut.mutate({ scope: confirm.scope, key: confirm.key }) : revokeMut.mutate(confirm.id); setConfirm(null); }}
        onCancel={() => setConfirm(null)} />
    </div>
  );
}

// ═══ BILLING ══════════════════════════════════════════════════════════════════
export function BillingTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error: loadError, refetch } = useQuery({ queryKey: ["admin-billing"], queryFn: getAdminBilling });
  const reconcile = useMutation({ mutationFn: adminReconcileBilling, onSuccess: (r) => { toast.success(`Reconciled: ${r.fetched ?? 0} active · granted ${r.granted ?? 0} · revoked ${r.revoked ?? 0}`); qc.invalidateQueries({ queryKey: ["admin-billing"] }); }, onError: (e) => toast.error(adminErr(e)) });
  if (isLoading) return <Loading />;
  if (isError) return <LoadError error={loadError} onRetry={refetch} />;
  const d = data || {};
  const cfg = d.config || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Provider" value={cfg.provider} ok={cfg.provider === "discord"} />
        <Tile label="Discord store" value={cfg.discord?.configured ? "configured" : "MISSING"} ok={!!cfg.discord?.configured} sub={cfg.discord?.storeUrl || "set DISCORD_CLIENT_ID + SKUs"} />
        <Tile label="Discord-billed servers" value={d.discord?.length ?? 0} sub={`last reconcile grant ${ago(d.lastReconcileGrantAt)}`} />
        <Tile label="Legacy Stripe" value={d.stripe?.length ?? 0} sub={`${d.agencies?.length ?? 0} agencies · ${d.graceServers ?? 0} in grace`} />
      </div>
      <Section title="Discord Premium Apps subscriptions" icon={CreditCard}
        right={<button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="cs-btn-secondary text-xs flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${reconcile.isPending ? "animate-spin" : ""}`} /> Reconcile entitlements now</button>}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Server</th><th>Plan</th><th>SKU</th><th>Subscription</th><th>Period end</th><th>Since</th></tr></thead><tbody>
          {!d.discord?.length && <tr><td colSpan={6} className="text-cs-dim">No Discord-billed servers yet.</td></tr>}
          {(d.discord || []).map((s) => (
            <tr key={s.id}><td>{s.name} <span className="font-mono text-[10px] text-cs-dim">{s.id}</span></td><td className="font-mono text-xs">{s.plan}</td><td className="font-mono text-[10px]">{s.discordSkuId}</td>
              <td className={s.statusLabel === "ending" ? "text-warning" : s.statusLabel === "inactive" ? "text-danger" : "text-success"}>{s.statusLabel || "—"}</td>
              <td className="text-xs">{fmt(s.discordCurrentPeriodEnd)}</td><td className="text-xs">{fmt(s.premiumSince)}</td></tr>
          ))}
        </tbody></table></div>
        <p className="font-mono text-[10px] text-cs-dim mt-2">Status is a label only (0 active · 1 inactive · 2 ending per Discord docs). Access comes from entitlements; reconcile runs every 6 h and on demand.</p>
      </Section>
      <Section title="Legacy Stripe subscriptions" icon={CreditCard}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Server</th><th>Plan</th><th>Interval</th><th>Stripe status</th><th>Grace until</th><th>Past due since</th></tr></thead><tbody>
          {!d.stripe?.length && <tr><td colSpan={6} className="text-cs-dim">None — Stripe is legacy only.</td></tr>}
          {(d.stripe || []).map((s) => (
            <tr key={s.id}><td>{s.name} <span className="font-mono text-[10px] text-cs-dim">{s.id}</span></td><td className="font-mono text-xs">{s.plan}{s.gracePlan ? ` (grace: ${s.gracePlan})` : ""}</td><td>{s.billingInterval || "—"}</td><td className="font-mono text-xs">{s.stripeStatus || "—"}</td><td className="text-xs">{fmt(s.accessUntil)}</td><td className="text-xs">{fmt(s.pastDueSince)}</td></tr>
          ))}
        </tbody></table></div>
      </Section>
      {d.agencies?.length > 0 && (
        <Section title="Legacy agencies" icon={Server}>
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Agency</th><th>Owner</th><th>Plan</th><th>Seats</th><th>Source</th><th>Status</th><th>Active</th></tr></thead><tbody>
            {d.agencies.map((a) => <tr key={a.id}><td className="font-mono text-[10px]">{a.id}</td><td className="font-mono text-[10px]">{a.ownerUserId}</td><td>{a.plan}</td><td>{a._count?.servers ?? "?"}/{a.seatLimit}</td><td>{a.planSource}</td><td className="font-mono text-xs">{a.stripeStatus || "—"}</td><td><Bool v={a.active} /></td></tr>)}
          </tbody></table></div>
        </Section>
      )}
    </div>
  );
}

// ═══ FLEET ════════════════════════════════════════════════════════════════════
export function FleetTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error: loadError, refetch } = useQuery({ queryKey: ["admin-fleet"], queryFn: getAdminFleet, refetchInterval: 30000 });
  const reconcile = useMutation({ mutationFn: adminReconcileFleet, onSuccess: (r) => { toast.success(`Fleet reconciled: ${JSON.stringify(r)}`); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); }, onError: (e) => toast.error(adminErr(e)) });
  if (isLoading) return <Loading />;
  if (isError) return <LoadError error={loadError} onRetry={refetch} />;
  const d = data || {};
  const bb = d.bot?.brandBots || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Main bot" value={d.bot?.gateway || "DOWN"} ok={d.bot?.gateway === "connected"} sub={d.bot?.uptime ? `up ${Math.floor(d.bot.uptime / 3600)} h` : d.bot?.error} />
        <Tile label="Brand bots running" value={`${bb.ready ?? 0}/${bb.total ?? 0}`} ok={bb.down === 0} sub={bb.down ? `${bb.down} down — check customer tokens` : "all ready"} />
        <Tile label="Servers with token" value={d.withToken?.length ?? 0} sub="candidates for a brand bot" />
        <Tile label="Entitled now" value={(d.withToken || []).filter((s) => ["whitelabel", "agency5", "agency10"].includes(s.plan) || s.agencyId).length} sub="white-label / agency plan" />
      </div>
      <Section title="White-label fleet" icon={Bot}
        right={<button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="cs-btn-secondary text-xs flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${reconcile.isPending ? "animate-spin" : ""}`} /> Reconcile brand bots now</button>}>
        <FleetBots />
        <p className="font-mono text-[10px] text-cs-dim mt-2">Reconcile converges running brand bots to the entitled set (the bot fails closed when the backend is unreachable — it never shuts live clients down on a network error). Pause keeps the token but stops the bot until you resume it — reconcile will not restart a paused bot.</p>
      </Section>
    </div>
  );
}

// v51 — white-label ботовете: жив статус от бота + пауза/рестарт/брандиране/токен.
function FleetBots() {
  const qc = useQueryClient();
  const toast = useToast();
  const [branding, setBranding] = useState(null);   // { id, name, customBotName, customBotAvatar }
  const [removing, setRemoving] = useState(null);   // server
  const [reason, setReason] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-fleet-bots"], queryFn: getAdminFleetBots, refetchInterval: 30000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-fleet-bots"] }); qc.invalidateQueries({ queryKey: ["admin-fleet"] }); };
  const act = useMutation({
    mutationFn: ({ id, action }) => adminFleetAction(id, action),
    onSuccess: (r) => { r.botError ? toast.error(`Saved, but the bot did not confirm: ${r.botError}`) : toast.success({ pause: "Bot paused.", resume: "Bot resumed.", restart: "Bot restarted." }[r.action] || "Done."); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  const brand = useMutation({
    mutationFn: ({ id, body }) => adminFleetBranding(id, body),
    onSuccess: (r) => { r.botError ? toast.error(`Saved, but the bot did not apply it: ${r.botError}`) : toast.success("Branding saved."); setBranding(null); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  const remove = useMutation({
    mutationFn: ({ id, why }) => adminFleetRemoveToken(id, why),
    onSuccess: () => { toast.success("Token removed — the brand bot is shutting down."); setRemoving(null); setReason(""); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  if (isLoading) return <div className="h-24 animate-pulse bg-cs-panel/40" role="status"><span className="sr-only">Loading…</span></div>;
  if (isError) return <LoadError error={error} onRetry={refetch} />;
  const bots = data?.bots || [];
  return (
    <>
      {!data?.botReachable && <p className="text-xs text-warning mb-3" role="alert">The bot process did not answer ({data?.botError || "unreachable"}) — live status is unknown; actions are saved and apply when it is back.</p>}
      <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Server</th><th>Bot</th><th>Status</th><th>Plan</th><th>Grace until</th><th className="text-right">Actions</th></tr></thead><tbody>
        {!bots.length && <tr><td colSpan={6} className="text-cs-dim">No server has uploaded a custom bot token.</td></tr>}
        {bots.map((b) => {
          const state = b.customBotPausedAt ? "paused" : b.live?.ready ? "online" : b.live ? "connecting" : "offline";
          const cls = { paused: "cs-badge-muted", online: "cs-badge-success", connecting: "cs-badge", offline: "cs-badge-danger" }[state];
          const busy = act.isPending && act.variables?.id === b.id;
          return (
            <tr key={b.id}>
              <td className="min-w-[10rem]">{b.name} <div className="font-mono text-[10px] text-cs-dim">{b.id}</div></td>
              <td className="min-w-[9rem]">{b.customBotName || b.live?.tag || "—"}{b.live?.ping != null && <div className="font-mono text-[10px] text-cs-dim">{b.live.ping} ms</div>}</td>
              <td><span className={cls}>{state}</span>{b.customBotPausedAt && <div className="font-mono text-[10px] text-cs-dim">since {fmt(b.customBotPausedAt)}</div>}</td>
              <td className="font-mono text-xs">{b.plan}{b.agencyId ? " · agency" : ""}</td>
              <td className="text-xs">{fmt(b.accessUntil)}</td>
              <td className="text-right whitespace-nowrap">
                {b.customBotPausedAt
                  ? <button type="button" className="cs-btn-secondary cs-btn-sm" disabled={busy} onClick={() => act.mutate({ id: b.id, action: "resume" })}>Resume</button>
                  : <>
                      <button type="button" className="cs-btn-ghost cs-btn-sm" disabled={busy} onClick={() => act.mutate({ id: b.id, action: "restart" })}>Restart</button>
                      <button type="button" className="cs-btn-ghost cs-btn-sm" disabled={busy} onClick={() => act.mutate({ id: b.id, action: "pause" })}>Pause</button>
                    </>}
                <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => setBranding({ id: b.id, server: b.name, name: b.customBotName || "", avatarUrl: b.customBotAvatar || "" })}>Branding</button>
                <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" aria-label={`Remove bot token for ${b.name}`} onClick={() => setRemoving(b)}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
              </td>
            </tr>
          );
        })}
      </tbody></table></div>

      {branding && (
        <Modal open onClose={() => { setBranding(null); brand.reset(); }} title={`Branding — ${branding.server}`} maxWidth="max-w-lg">
          <form onSubmit={(e) => { e.preventDefault(); brand.mutate({ id: branding.id, body: { name: branding.name.trim() || null, avatarUrl: branding.avatarUrl.trim() || null } }); }} className="space-y-4">
            <div>
              <label className="cs-label" htmlFor="wl-name">Bot name</label>
              <input id="wl-name" className="cs-input" maxLength={32} value={branding.name} onChange={(e) => setBranding({ ...branding, name: e.target.value })} placeholder="2–32 characters (empty = keep Discord's)" />
            </div>
            <div>
              <label className="cs-label" htmlFor="wl-avatar">Avatar URL (https)</label>
              <input id="wl-avatar" className="cs-input font-mono text-xs" type="url" value={branding.avatarUrl} onChange={(e) => setBranding({ ...branding, avatarUrl: e.target.value })} placeholder="https://…" />
              <p className="text-xs text-cs-dim mt-1">Discord allows about two avatar changes per hour; the bot restarts to apply it.</p>
            </div>
            {brand.isError && <p className="text-xs text-danger" role="alert">{adminErr(brand.error)}</p>}
            <div className="flex justify-end gap-3 pt-2 border-t border-cs-border">
              <button type="button" className="cs-btn-ghost" onClick={() => { setBranding(null); brand.reset(); }}>Cancel</button>
              <button type="submit" className="cs-btn-primary" disabled={brand.isPending}>{brand.isPending ? "Saving…" : "Save branding"}</button>
            </div>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal open onClose={() => { setRemoving(null); setReason(""); remove.reset(); }} title={`Remove bot token — ${removing.name}`} maxWidth="max-w-md">
          <p className="text-sm text-cs-muted mb-4">The encrypted token is deleted and the brand bot shuts down. The customer has to paste a new token to bring it back. Main Owner only.</p>
          <label className="cs-label" htmlFor="wl-reason">Reason (kept in the audit log)</label>
          <input id="wl-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. token leaked, abuse report #…" />
          {remove.isError && <p className="text-xs text-danger mt-2" role="alert">{adminErr(remove.error)}</p>}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cs-border">
            <button type="button" className="cs-btn-ghost" onClick={() => { setRemoving(null); setReason(""); remove.reset(); }}>Cancel</button>
            <button type="button" className="cs-btn-danger" disabled={remove.isPending || reason.trim().length < 3} onClick={() => remove.mutate({ id: removing.id, why: reason.trim() })}>{remove.isPending ? "Removing…" : "Remove token"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═══ COMPLIANCE / DSR ═════════════════════════════════════════════════════════
export function ComplianceTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [lookupId, setLookupId] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [scope, setScope] = useState("identity");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const { data: requests } = useQuery({ queryKey: ["admin-dsr-requests"], queryFn: getDsrRequests });
  const { data: summary, isFetching, error } = useQuery({ queryKey: ["admin-dsr", activeId], queryFn: () => getDsrSummary(activeId), enabled: !!activeId });
  const erase = useMutation({
    mutationFn: () => dsrErase(activeId, { scope, note: note || undefined, confirm: true }),
    onSuccess: (r) => { toast.success(`Erased (${r.scope}): ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`); qc.invalidateQueries({ queryKey: ["admin-dsr", activeId] }); qc.invalidateQueries({ queryKey: ["admin-dsr-requests"] }); },
    onError: (e) => toast.error(e?.response?.data?.error || adminErr(e)),
  });
  const c = summary?.counts || {};
  return (
    <div className="space-y-6">
      <Section title="Data subject request — look up a Discord user" icon={Search}>
        <form onSubmit={(e) => { e.preventDefault(); if (/^\d{5,25}$/.test(lookupId.trim())) setActiveId(lookupId.trim()); else toast.error("Enter a numeric Discord user id."); }} className="flex flex-wrap gap-2">
          <input className="cs-input !w-72 font-mono" value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Discord user id (snowflake)" inputMode="numeric" />
          <button type="submit" className="cs-btn-primary">Look up</button>
        </form>
        <p className="font-mono text-[10px] text-cs-dim mt-2">Discord Developer Terms §5(b): delete API Data promptly when the user asks. Users can also self-serve with <code>/privacy delete</code> in Discord (identity scope) or the dashboard Privacy settings.</p>
        {error && <p role="alert" className="text-danger text-sm mt-3">{adminErr(error)}</p>}
        {activeId && summary && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Tile label="Dashboard account" value={summary.registered ? "yes" : "no"} sub={summary.user ? `${summary.user.username} · ${summary.user.globalRole}${summary.user.hasEmail ? " · email on file" : ""}` : ""} />
              <Tile label="Tickets / messages" value={`${c.tickets ?? 0} / ${c.messages ?? 0}`} />
              <Tile label="Applications" value={c.applications ?? 0} />
              <Tile label="Role snapshots" value={c.roleSnapshots ?? 0} sub={`${c.verificationAttempts ?? 0} verification attempts`} />
              <Tile label="Sessions / API keys" value={`${c.sessions ?? 0} / ${c.apiKeys ?? 0}`} sub={`${c.memberships ?? 0} memberships · ${c.ownedServers ?? 0} owned servers`} />
            </div>
            <div className="cs-card bg-cs-bg space-y-3">
              <div className="flex flex-wrap gap-4 items-end">
                <label className="block"><span className="cs-label">Scope</span>
                  <select className="cs-input !w-56" value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="identity">identity — anonymise identifiers</option>
                    <option value="full">full — also erase message text & answers</option>
                  </select></label>
                <label className="block flex-1 min-w-[16rem]"><span className="cs-label">Request reference (audit note)</span>
                  <input className="cs-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. email of 2026-09-13, ticket #42" /></label>
                <button type="button" onClick={() => setConfirm(true)} className="cs-btn-primary bg-danger border-danger flex items-center gap-2" disabled={erase.isPending || (summary.user && ["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"].includes(summary.user.globalRole))}>
                  <Trash2 className="w-4 h-4" /> Erase data
                </button>
              </div>
              <p className="text-xs text-cs-dim">identity: profile, message author signature, sessions, API keys, role snapshots, verification attempts, memberships. full: additionally replaces the user's ticket message text and application answers with “[erased]” — the server operator loses that text. Staff accounts and accounts with active paid subscriptions are refused. Every erasure is audited as DSR_ERASED with your note.</p>
            </div>
          </div>
        )}
        {activeId && isFetching && !summary && <p className="text-sm text-cs-dim mt-3">Loading…</p>}
      </Section>
      <Section title="Data subject request log" icon={FileText}>
        {!requests?.requests?.length ? <p className="text-sm text-cs-dim">No requests recorded yet.</p> : (
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>When</th><th>Action</th><th>Subject</th><th>By</th><th>Details</th></tr></thead><tbody>
            {requests.requests.map((r) => <tr key={r.id}><td className="text-xs">{fmt(r.createdAt)}</td><td className="font-mono text-xs">{r.action}</td><td className="font-mono text-[10px]">{r.targetId}</td><td className="text-xs">{r.actor?.username || r.actorTag || "—"}</td><td className="font-mono text-[10px] text-cs-dim">{r.metadata ? `${r.metadata.scope || ""} ${r.metadata.via || ""} ${r.metadata.note || ""}`.trim() : ""}</td></tr>)}
          </tbody></table></div>
        )}
      </Section>
      <ConfirmDialog open={confirm} title={`Erase data for ${activeId}?`} message={`Scope: ${scope}. This cannot be undone. A fresh second-factor confirmation (≤10 min) is required.`} confirmLabel="Erase" destructive loading={erase.isPending}
        onConfirm={() => { setConfirm(false); erase.mutate(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}

// ═══ SERVER SEASON (v50) ══════════════════════════════════════════════════════
// Сезоните са глобални: кодът, името, датите и кои спътници са сезонни се
// управляват оттук (базата), не от кода. Смяната засяга ВСИЧКИ сървъри.
// Полетата са обявени като UTC — utils/utcDateInput.js (тестван) ги чете и пише като UTC.
const toLocalInput = toUtcInput;
const fromLocalInput = fromUtcInput;
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

function SeasonForm({ initial, catalog, onSubmit, pending, submitLabel, withCode }) {
  const [form, setForm] = useState(() => ({
    code: initial?.code || "", name: initial?.name || "", startsAt: toLocalInput(initial?.startsAt), endsAt: toLocalInput(initial?.endsAt),
    companionIds: [...(initial?.companionIds || [])],
  }));
  const toggle = (id) => setForm((f) => ({ ...f, companionIds: f.companionIds.includes(id) ? f.companionIds.filter((x) => x !== id) : [...f.companionIds, id] }));
  const groups = RARITY_ORDER.map((r) => ({ r, items: catalog.filter((c) => c.rarity === r) })).filter((g) => g.items.length);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...(withCode ? { code: form.code.trim().toUpperCase() } : {}), name: form.name.trim(), startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt), companionIds: form.companionIds }); }}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {withCode && <label className="block"><span className="cs-label">Code</span><input className="cs-input font-mono" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="S2" maxLength={16} required /></label>}
        <label className={`block ${withCode ? "" : "md:col-span-2"}`}><span className="cs-label">Name</span><input className="cs-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={80} required /></label>
        <label className="block"><span className="cs-label">Starts (UTC)</span><input className="cs-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} required /></label>
        <label className="block"><span className="cs-label">Ends (UTC)</span><input className="cs-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} required /></label>
      </div>
      <div>
        <div className="cs-label mb-1">Seasonal companions — {form.companionIds.length} selected (they spawn only while the season is active and leave when it ends)</div>
        {groups.map((g) => (
          <div key={g.r} className="mb-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-cs-dim mb-1">{g.items[0].rarityEmoji} {g.r}</div>
            <div className="flex flex-wrap gap-2">
              {g.items.map((c) => {
                const on = form.companionIds.includes(c.id);
                return (
                  <button type="button" key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
                    className={`flex items-center gap-2 px-2 py-1 rounded border text-xs transition-colors ${on ? "border-cs-cyan text-cs-cyan" : "border-cs-border text-cs-muted hover:text-cs-text"}`}>
                    <img src={c.imageUrl.replace(/^https?:\/\/[^/]+/, "")} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 rounded" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end"><button type="submit" className="cs-btn-primary" disabled={pending}>{submitLabel}</button></div>
    </form>
  );
}

export function SeasonTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError, error: loadError, refetch } = useQuery({ queryKey: ["admin-game-season"], queryFn: getAdminGameSeason });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-game-season"] });
  const update = useMutation({ mutationFn: ({ code, body }) => updateAdminGameSeason(code, body), onSuccess: () => { toast.success("Season updated — the bot picks it up within a minute."); refresh(); }, onError: (e) => toast.error(adminErr(e)) });
  const create = useMutation({ mutationFn: createAdminGameSeason, onSuccess: (s) => { toast.success(`Season ${s.code} created.`); setCreating(false); refresh(); }, onError: (e) => toast.error(adminErr(e)) });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const remove = useMutation({ mutationFn: deleteAdminGameSeason, onSuccess: () => { toast.success(`Season ${confirmDelete} deleted.`); setConfirmDelete(null); refresh(); }, onError: (e) => toast.error(adminErr(e)) });
  if (isLoading) return <Loading />;
  if (isError) return <LoadError error={loadError} onRetry={refetch} />;
  const d = data || { seasons: [], catalog: [] };
  const cur = d.current;
  const status = !cur ? "none" : cur.ended ? "ended" : cur.active ? "active" : "upcoming";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Current season" value={cur ? cur.code : "—"} sub={cur?.name} ok={status === "active"} />
        <Tile label="Status" value={status} ok={status === "active" ? true : status === "ended" ? false : undefined} sub={cur ? `${fmt(cur.startsAt)} → ${fmt(cur.endsAt)}` : "no season row yet"} />
        <Tile label="Seasonal companions" value={cur?.companionIds?.length ?? 0} sub="spawn only while active" />
        <Tile label="Seasons on record" value={d.seasons.length} sub="newest by start date becomes current" />
      </div>
      {status === "ended" && <p className="text-xs text-warning">The current season has ended: seasonal companions no longer spawn and the daily job resets season XP once per server. Create the next season below.</p>}
      <Section title={`Edit ${cur ? cur.code : "season"}`} icon={Sparkles}
        right={<button type="button" onClick={() => setCreating((v) => !v)} className="cs-btn-secondary text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> New season</button>}>
        {cur ? (
          <SeasonForm key={cur.code} initial={cur} catalog={d.catalog} pending={update.isPending} submitLabel="Save season" onSubmit={(body) => update.mutate({ code: cur.code, body })} />
        ) : <p className="text-cs-dim">No season yet — create one.</p>}
        <p className="font-mono text-[10px] text-cs-dim mt-3">Requires Main Owner + a fresh second factor. Changes apply to every server: spawns read the season from the database (cached 60 s). Levels, sparks and caught companions are never touched by a season change.</p>
      </Section>
      {creating && (
        <Section title="New season" icon={Plus}>
          <SeasonForm initial={{ companionIds: [] }} catalog={d.catalog} withCode pending={create.isPending} submitLabel="Create season" onSubmit={(body) => create.mutate(body)} />
          <p className="font-mono text-[10px] text-cs-dim mt-3">Becomes current once its start date is reached (a later start keeps the present season running until then). The previous season is closed by the nightly job when its end date passes.</p>
        </Section>
      )}
      <Section title="All seasons" icon={FileText}>
        <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Code</th><th>Name</th><th>Starts</th><th>Ends</th><th>Seasonal</th><th>State</th><th className="text-right">Actions</th></tr></thead><tbody>
          {!d.seasons.length && <tr><td colSpan={7} className="text-cs-dim">No seasons.</td></tr>}
          {d.seasons.map((s) => {
            const upcoming = !s.ended && !s.active;
            return (
              <tr key={s.code}><td className="font-mono">{s.code}</td><td>{s.name}</td><td className="text-xs">{fmt(s.startsAt)}</td><td className="text-xs">{fmt(s.endsAt)}</td><td>{s.companionIds.length}</td><td><span className="cs-badge">{s.ended ? "ended" : s.active ? "active" : "upcoming"}</span></td>
                <td className="text-right">
                  {upcoming
                    ? <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" onClick={() => setConfirmDelete(s.code)} aria-label={`Delete season ${s.code}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    : <span className="font-mono text-[10px] text-cs-dim" title="A started season has already shaped the servers — end it by changing its end date.">locked</span>}
                </td>
              </tr>
            );
          })}
        </tbody></table></div>
        <p className="font-mono text-[10px] text-cs-dim mt-3">Only a season that has not started can be deleted. To end a running season early, set its end date.</p>
      </Section>
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Delete season ${confirmDelete}?`}
          message="It has not started yet, so no server has been affected. This cannot be undone."
          confirmLabel="Delete season"
          destructive
          loading={remove.isPending}
          onConfirm={() => remove.mutate(confirmDelete)}
          onCancel={() => { setConfirmDelete(null); remove.reset(); }}
        />
      )}
    </div>
  );
}
