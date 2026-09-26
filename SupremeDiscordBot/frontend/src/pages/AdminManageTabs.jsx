// frontend/src/pages/AdminManageTabs.jsx
// Админ конзола v51 (EN-only, изключена от i18n): „Game“ — играта по сървъри,
// „Support“ — тикети/панели/форми през всички сървъри. Данните идват от
// routes/adminManage.js; каквото таблото на сървъра вече прави (настройки на
// играта, магазин, куестове, затваряне на тикет, изтриване на панел/форма) се
// вика ОТТАМ — requireServerAdmin пуска платформения админ с потвърден фактор.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gamepad2, Search, Server, LifeBuoy, ExternalLink, Trash2, Sparkles, SlidersHorizontal, RotateCcw, XCircle } from "lucide-react";
import {
  getAdminServers, getAdminGameMembers, getAdminMemberCompanions, adminAdjustMember, adminGrantCompanion, adminRevokeCompanion,
  adminResetGame, getAdminGameSeason, getAdminTickets, deleteAdminTicket, getAdminPanels, getAdminForms,
  closeTicket, deleteAdminPanel, deleteAdminForm,
} from "../api";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import { Section, Loading, LoadError, fmt } from "./AdminOpsTabs";
import { Pager, adminErr } from "./adminShared";

const SNOWFLAKE = /^\d{17,20}$/;

// ─── Избор на сървър (търсене по име или id) ────────────────────────────────
function ServerPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["admin-server-picker", q],
    queryFn: () => getAdminServers({ query: q || undefined, limit: 8 }),
    enabled: !value,
  });
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Server className="w-4 h-4 text-cs-cyan" aria-hidden="true" />
        <span className="text-cs-text font-medium">{value.name}</span>
        <span className="font-mono text-[10px] text-cs-dim">{value.id}</span>
        <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => onChange(null)}>Change server</button>
      </div>
    );
  }
  return (
    <div>
      <label className="cs-label" htmlFor="admin-server-search">Server</label>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim" aria-hidden="true" />
        <input id="admin-server-search" className="cs-input pl-10" placeholder="Search by server name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-2 max-w-md divide-y divide-cs-border border border-cs-border" aria-busy={isFetching || undefined}>
        {(data?.servers || []).map((s) => (
          <li key={s.id}>
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-cs-panel/60 flex items-center justify-between gap-3" onClick={() => onChange({ id: s.id, name: s.name })}>
              <span className="truncate">{s.name}</span>
              <span className="font-mono text-[10px] text-cs-dim shrink-0">{s.id}</span>
            </button>
          </li>
        ))}
        {!isFetching && !(data?.servers || []).length && <li className="px-3 py-2 text-xs text-cs-dim">No servers match.</li>}
      </ul>
    </div>
  );
}

// ═══ GAME ═════════════════════════════════════════════════════════════════════
export function GameAdminTab() {
  const [server, setServer] = useState(null);
  return (
    <div className="space-y-6">
      <Section title="Game by server" icon={Gamepad2}>
        <ServerPicker value={server} onChange={setServer} />
        {server && (
          <p className="text-xs text-cs-dim mt-4">
            Settings, shop items, level roles and quests live on the server's own Game page — you can open it as a platform admin:{" "}
            <Link className="text-cs-cyan underline" to={`/dashboard/${server.id}/game`}>open the Game page <ExternalLink className="inline w-3 h-3" aria-hidden="true" /></Link>.
            This tab adds what the server page cannot do: correct a member, grant or take a companion, reset the game.
          </p>
        )}
      </Section>
      {server && <GameMembers key={server.id} server={server} />}
    </div>
  );
}

function GameMembers({ server }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null);
  const [companionsOf, setCompanionsOf] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-game-members", server.id, q, page],
    queryFn: () => getAdminGameMembers(server.id, { q: q || undefined, page, limit: 25 }),
    placeholderData: (prev) => prev,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-game-members", server.id] });
  const reset = useMutation({
    mutationFn: ({ scope, reason }) => adminResetGame(server.id, scope, reason),
    onSuccess: (r) => { toast.success(`Game reset (${r.scope}): ${r.counts?.members ?? 0} players cleared.`); setResetOpen(false); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  const members = data?.members || [];
  return (
    <Section title={`Players — ${server.name}`} icon={Sparkles}
      right={<button type="button" className="cs-btn-danger cs-btn-sm" onClick={() => setResetOpen(true)}><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset game</button>}>
      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim" aria-hidden="true" />
        <input className="cs-input pl-10" placeholder="Filter by user ID or dashboard username…" aria-label="Filter players" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {isLoading ? <Loading /> : isError ? <LoadError error={error} onRetry={refetch} /> : (
        <>
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Player</th><th>Level</th><th>XP</th><th>Sparks</th><th>Companions</th><th>Streak</th><th>Last activity</th><th className="text-right">Actions</th></tr></thead><tbody>
            {!members.length && <tr><td colSpan={8} className="text-cs-dim">{q ? "No player matches." : "Nobody has played on this server yet."}</td></tr>}
            {members.map((m) => (
              <tr key={m.userId}>
                <td className="min-w-[10rem]">{m.username || <span className="text-cs-dim">unknown name</span>}<div className="font-mono text-[10px] text-cs-dim">{m.userId}</div></td>
                <td className="font-mono">{m.level}</td>
                <td className="font-mono text-xs">{m.xp.toLocaleString()}</td>
                <td className="font-mono text-xs">✨ {m.sparks.toLocaleString()}</td>
                <td className="font-mono text-xs">{m.companions}</td>
                <td className="font-mono text-xs">{m.streak}</td>
                <td className="text-xs">{fmt(m.updatedAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => setAdjusting(m)} aria-label={`Adjust XP and sparks for ${m.username || m.userId}`}><SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Adjust</button>
                  <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => setCompanionsOf(m)}>Companions</button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
          <Pager page={page} limit={data?.limit || 25} total={data?.total || 0} onPage={setPage} />
          <GrantToUser server={server} onDone={refresh} />
        </>
      )}
      {adjusting && <AdjustModal server={server} member={adjusting} onClose={() => setAdjusting(null)} onDone={refresh} />}
      {companionsOf && <CompanionsModal server={server} userId={companionsOf.userId} label={companionsOf.username || companionsOf.userId} onClose={() => setCompanionsOf(null)} onDone={refresh} />}
      {resetOpen && <ResetModal server={server} pending={reset.isPending} error={reset.error} onConfirm={(scope, reason) => reset.mutate({ scope, reason })} onClose={() => { setResetOpen(false); reset.reset(); }} />}
    </Section>
  );
}

// Играч без ред в класацията (не е играл) също може да получи спътник по ID.
function GrantToUser({ server, onDone }) {
  const [uid, setUid] = useState("");
  const [open, setOpen] = useState(null);
  return (
    <div className="mt-6 pt-4 border-t border-cs-border">
      <label className="cs-label" htmlFor="grant-uid">Manage a member by Discord user ID</label>
      <div className="flex flex-wrap gap-2">
        <input id="grant-uid" className="cs-input font-mono text-xs max-w-xs" inputMode="numeric" placeholder="17–20 digit user ID" value={uid} onChange={(e) => setUid(e.target.value.trim())} />
        <button type="button" className="cs-btn-secondary cs-btn-sm" disabled={!SNOWFLAKE.test(uid)} onClick={() => setOpen(uid)}>Companions</button>
      </div>
      {open && <CompanionsModal server={server} userId={open} label={open} onClose={() => setOpen(null)} onDone={onDone} />}
    </div>
  );
}

function AdjustModal({ server, member, onClose, onDone }) {
  const toast = useToast();
  const [xp, setXp] = useState("0");
  const [sparks, setSparks] = useState("0");
  const [reason, setReason] = useState("");
  const int = (v) => (/^-?\d{1,8}$/.test(v.trim()) ? Number(v) : NaN);
  const xpDelta = int(xp), sparksDelta = int(sparks);
  const valid = Number.isInteger(xpDelta) && Number.isInteger(sparksDelta) && (xpDelta || sparksDelta) && reason.trim().length >= 3;
  const mut = useMutation({
    mutationFn: () => adminAdjustMember(server.id, member.userId, { xpDelta, sparksDelta, reason: reason.trim() }),
    onSuccess: (r) => { toast.success(`Now level ${r.after.level} · ${r.after.xp} XP · ✨ ${r.after.sparks}`); onDone(); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title={`Adjust — ${member.username || member.userId}`} maxWidth="max-w-md">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) mut.mutate(); }} className="space-y-4">
        <p className="text-xs text-cs-dim">Now: level {member.level} · {member.xp} XP · ✨ {member.sparks}. Use a minus sign to take away. Values never drop below zero; the level is recalculated from XP. Level roles and announcements are not triggered.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="cs-label" htmlFor="adj-xp">XP change</label><input id="adj-xp" className="cs-input font-mono" inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value)} /></div>
          <div><label className="cs-label" htmlFor="adj-sp">Sparks change</label><input id="adj-sp" className="cs-input font-mono" inputMode="numeric" value={sparks} onChange={(e) => setSparks(e.target.value)} /></div>
        </div>
        <div><label className="cs-label" htmlFor="adj-reason">Reason (audit log)</label><input id="adj-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. refund for a failed purchase" /></div>
        {mut.isError && <p className="text-xs text-danger" role="alert">{adminErr(mut.error)}</p>}
        <div className="flex justify-end gap-3 pt-2 border-t border-cs-border">
          <button type="button" className="cs-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="cs-btn-primary" disabled={!valid || mut.isPending}>{mut.isPending ? "Saving…" : "Apply"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CompanionsModal({ server, userId, label, onClose, onDone }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [companionId, setCompanionId] = useState("");
  const [stage, setStage] = useState("1");
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(null);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-member-companions", server.id, userId], queryFn: () => getAdminMemberCompanions(server.id, userId) });
  const { data: season } = useQuery({ queryKey: ["admin-game-season"], queryFn: getAdminGameSeason });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-member-companions", server.id, userId] }); onDone(); };
  const grant = useMutation({
    mutationFn: () => adminGrantCompanion(server.id, userId, { companionId, stage: Number(stage), reason: reason.trim() }),
    onSuccess: (r) => { toast.success(`${r.companion?.name || companionId} granted.`); setCompanionId(""); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  const revoke = useMutation({
    mutationFn: (ownedId) => adminRevokeCompanion(server.id, ownedId, reason.trim()),
    onSuccess: () => { toast.success("Companion removed."); setRevoking(null); refresh(); },
    onError: (e) => toast.error(adminErr(e)),
  });
  const rows = data?.companions || [];
  const reasonOk = reason.trim().length >= 3;
  return (
    <Modal open onClose={onClose} title={`Companions — ${label}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div>
          <label className="cs-label" htmlFor="comp-reason">Reason for any change (audit log)</label>
          <input id="comp-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. event prize, lost after a bug" />
        </div>
        {isLoading ? <Loading /> : isError ? <LoadError error={error} onRetry={refetch} /> : (
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Companion</th><th>Form</th><th>Fed</th><th>Caught</th><th className="text-right">Remove</th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan={5} className="text-cs-dim">No companions.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.rarityEmoji} {c.name}{c.seasonId && <span className="font-mono text-[10px] text-cs-dim"> · {c.seasonId}</span>}</td>
                <td className="font-mono">{c.stage}</td><td className="font-mono text-xs">{c.fed}</td><td className="text-xs">{fmt(c.caughtAt)}</td>
                <td className="text-right">
                  {revoking === c.id
                    ? <button type="button" className="cs-btn-danger cs-btn-sm" disabled={!reasonOk || revoke.isPending} onClick={() => revoke.mutate(c.id)}>{reasonOk ? "Confirm" : "Add a reason"}</button>
                    : <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" aria-label={`Remove ${c.name}`} onClick={() => setRevoking(c.id)}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <form className="pt-4 border-t border-cs-border grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end" onSubmit={(e) => { e.preventDefault(); if (companionId && reasonOk) grant.mutate(); }}>
          <div>
            <label className="cs-label" htmlFor="comp-pick">Grant a companion</label>
            <select id="comp-pick" className="cs-select" value={companionId} onChange={(e) => setCompanionId(e.target.value)}>
              <option value="">Choose…</option>
              {(season?.catalog || []).map((c) => <option key={c.id} value={c.id}>{c.rarityEmoji} {c.name} · {c.rarity}{c.seasonal ? " · seasonal" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="cs-label" htmlFor="comp-stage">Form</label>
            <select id="comp-stage" className="cs-select" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </select>
          </div>
          <button type="submit" className="cs-btn-primary" disabled={!companionId || !reasonOk || grant.isPending}>{grant.isPending ? "Granting…" : "Grant"}</button>
        </form>
        <p className="text-[11px] text-cs-dim">Granting ignores the collection limit and the plan's rarity rules on purpose (compensation, event prizes). The first companion becomes the member's active one.</p>
      </div>
    </Modal>
  );
}

function ResetModal({ server, pending, error, onConfirm, onClose }) {
  const [scope, setScope] = useState("progress");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ok = reason.trim().length >= 3 && typed.trim() === server.name.trim();
  return (
    <Modal open onClose={onClose} title={`Reset game — ${server.name}`} maxWidth="max-w-lg">
      <fieldset className="space-y-2 mb-4">
        <legend className="cs-label">What to reset</legend>
        <label className="flex gap-2 text-sm"><input type="radio" name="reset-scope" checked={scope === "progress"} onChange={() => setScope("progress")} /> <span><strong>Progress</strong> — levels, XP, sparks, companions, trades and spawns. Settings, shop and quests stay.</span></label>
        <label className="flex gap-2 text-sm"><input type="radio" name="reset-scope" checked={scope === "all"} onChange={() => setScope("all")} /> <span><strong>Everything</strong> — also shop items, quests, trivia and settings (the game is switched off).</span></label>
      </fieldset>
      <p className="text-xs text-cs-dim mb-4">Shop purchases are kept in both cases so timed roles still expire on time. Main Owner only; cannot be undone.</p>
      <label className="cs-label" htmlFor="reset-reason">Reason (audit log)</label>
      <input id="reset-reason" className="cs-input mb-3" value={reason} onChange={(e) => setReason(e.target.value)} />
      <label className="cs-label" htmlFor="reset-typed">Type the server name to confirm</label>
      <input id="reset-typed" className="cs-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={server.name} />
      {error && <p className="text-xs text-danger mt-2" role="alert">{adminErr(error)}</p>}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cs-border">
        <button type="button" className="cs-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="cs-btn-danger" disabled={!ok || pending} onClick={() => onConfirm(scope, reason.trim())}>{pending ? "Resetting…" : "Reset game"}</button>
      </div>
    </Modal>
  );
}

// ═══ SUPPORT ══════════════════════════════════════════════════════════════════
const SUPPORT_VIEWS = [["tickets", "Tickets"], ["panels", "Panels"], ["forms", "Forms"]];

export function SupportTab() {
  const [view, setView] = useState("tickets");
  const [serverId, setServerId] = useState("");
  const [q, setQ] = useState("");
  const sid = SNOWFLAKE.test(serverId.trim()) ? serverId.trim() : undefined;
  return (
    <div className="space-y-6">
      <Section title="Support across all servers" icon={LifeBuoy}>
        <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Support view">
          {SUPPORT_VIEWS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "cs-btn-primary cs-btn-sm" : "cs-btn-secondary cs-btn-sm"} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <input className="cs-input font-mono text-xs max-w-[15rem]" placeholder="Server ID (optional)" aria-label="Filter by server ID" value={serverId} onChange={(e) => setServerId(e.target.value)} />
          <div className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cs-dim" aria-hidden="true" />
            <input className="cs-input pl-10" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={view === "tickets" ? "Ticket #, ID, channel ID, creator name or ID…" : "Name or ID…"} />
          </div>
        </div>
      </Section>
      {view === "tickets" && <TicketsList serverId={sid} q={q} />}
      {view === "panels" && <PanelsList serverId={sid} q={q} />}
      {view === "forms" && <FormsList serverId={sid} q={q} />}
    </div>
  );
}

const STATUS_BADGE = { OPEN: "cs-badge-success", CLAIMED: "cs-badge-cyan", CLOSED: "cs-badge-muted", ARCHIVED: "cs-badge-muted" };

function TicketsList({ serverId, q }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  // Нов филтър → първа страница (иначе страница 3 на новия филтър е празна; ревю 26.09.2026).
  useEffect(() => { setPage(1); }, [serverId, q]);
  const [acting, setActing] = useState(null); // { ticket, kind: "close" | "delete" }
  const [reason, setReason] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-tickets", serverId, q, status, page],
    queryFn: () => getAdminTickets({ serverId, q: q || undefined, status: status || undefined, page, limit: 25 }),
    placeholderData: (prev) => prev,
  });
  const done = (msg) => { toast.success(msg); setActing(null); setReason(""); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); };
  const close = useMutation({ mutationFn: ({ t, why }) => closeTicket(t.serverId, t.id, why), onSuccess: (r) => done(r?.botWarning ? `Closed in the database — ${r.botWarning}` : "Ticket closed."), onError: (e) => toast.error(adminErr(e)) });
  const del = useMutation({ mutationFn: ({ t, why }) => deleteAdminTicket(t.id, why), onSuccess: () => done("Ticket deleted."), onError: (e) => toast.error(adminErr(e)) });
  const rows = data?.tickets || [];
  const pending = close.isPending || del.isPending;
  return (
    <Section title="Tickets" icon={LifeBuoy} right={
      <select className="cs-select max-w-[10rem]" aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">All statuses</option><option value="OPEN">Open</option><option value="CLAIMED">Claimed</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option>
      </select>}>
      {isLoading ? <Loading /> : isError ? <LoadError error={error} onRetry={refetch} /> : (
        <>
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Ticket</th><th>Server</th><th>Creator</th><th>Status</th><th>Messages</th><th>Opened</th><th className="text-right">Actions</th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan={7} className="text-cs-dim">No tickets match.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="min-w-[8rem]">#{t.number ?? "—"}{t.panel?.name && <span className="text-cs-dim"> · {t.panel.name}</span>}<div className="font-mono text-[10px] text-cs-dim">{t.id}</div></td>
                <td className="min-w-[8rem]">{t.server?.name}<div className="font-mono text-[10px] text-cs-dim">{t.serverId}</div></td>
                <td>{t.creator?.username || t.creator?.id}</td>
                <td><span className={STATUS_BADGE[t.status] || "cs-badge"}>{t.status.toLowerCase()}</span>{t.hasTranscript && <div className="font-mono text-[10px] text-cs-dim">transcript</div>}</td>
                <td className="font-mono text-xs">{t._count?.messages ?? 0}</td>
                <td className="text-xs">{fmt(t.createdAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <Link className="cs-btn-ghost cs-btn-sm" to={`/dashboard/${t.serverId}/tickets`} title="Open the server's ticket page (transcripts, replies)"><ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open</Link>
                  {["OPEN", "CLAIMED"].includes(t.status)
                    ? <button type="button" className="cs-btn-ghost cs-btn-sm" onClick={() => setActing({ t, kind: "close" })}><XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Close</button>
                    : <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" aria-label={`Delete ticket ${t.number ?? t.id}`} onClick={() => setActing({ t, kind: "delete" })}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
          <Pager page={page} limit={data?.limit || 25} total={data?.total || 0} onPage={setPage} />
        </>
      )}
      {acting && (
        <Modal open onClose={() => { setActing(null); setReason(""); close.reset(); del.reset(); }} title={`${acting.kind === "close" ? "Close" : "Delete"} ticket #${acting.t.number ?? acting.t.id}`} maxWidth="max-w-md">
          <p className="text-sm text-cs-muted mb-4">{acting.kind === "close"
            ? "Closes it like staff would: the transcript is saved and the Discord channel is closed by the bot."
            : "Deletes the closed ticket and its messages and transcript from the database. Main Owner only; cannot be undone."}</p>
          <label className="cs-label" htmlFor="ticket-reason">Reason{acting.kind === "delete" ? " (audit log)" : " (shown in the close message)"}</label>
          <input id="ticket-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cs-border">
            <button type="button" className="cs-btn-ghost" onClick={() => { setActing(null); setReason(""); }}>Cancel</button>
            <button type="button" className={acting.kind === "close" ? "cs-btn-primary" : "cs-btn-danger"} disabled={pending || reason.trim().length < 3}
              onClick={() => (acting.kind === "close" ? close : del).mutate({ t: acting.t, why: reason.trim() })}>{pending ? "Working…" : acting.kind === "close" ? "Close ticket" : "Delete ticket"}</button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function PanelsList({ serverId, q }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  // Нов филтър → първа страница (иначе страница 3 на новия филтър е празна; ревю 26.09.2026).
  useEffect(() => { setPage(1); }, [serverId, q]);
  const [confirm, setConfirm] = useState(null);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-panels", serverId, q, page], queryFn: () => getAdminPanels({ serverId, q: q || undefined, page, limit: 25 }), placeholderData: (prev) => prev });
  const [reason, setReason] = useState("");
  // Админ маршрутът (step-up + MAIN_OWNER + одит), не този на таблото — ревю 26.09.2026.
  const del = useMutation({ mutationFn: (p) => deleteAdminPanel(p.id, reason.trim()), onSuccess: () => { toast.success("Panel deleted."); setConfirm(null); setReason(""); qc.invalidateQueries({ queryKey: ["admin-panels"] }); }, onError: (e) => toast.error(adminErr(e)) });
  const rows = data?.panels || [];
  return (
    <Section title="Panels" icon={LifeBuoy}>
      {isLoading ? <Loading /> : isError ? <LoadError error={error} onRetry={refetch} /> : (
        <>
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Panel</th><th>Server</th><th>Posted</th><th>Tickets</th><th>Created</th><th className="text-right">Actions</th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan={6} className="text-cs-dim">No panels match.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}<div className="font-mono text-[10px] text-cs-dim">{p.id}</div></td>
                <td>{p.server?.name}<div className="font-mono text-[10px] text-cs-dim">{p.serverId}</div></td>
                <td className="text-xs">{p.messageId ? "yes" : "no"}</td>
                <td className="font-mono text-xs">{p._count?.tickets ?? 0}</td>
                <td className="text-xs">{fmt(p.createdAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <Link className="cs-btn-ghost cs-btn-sm" to={`/dashboard/${p.serverId}/panels`}><ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Edit</Link>
                  <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" aria-label={`Delete panel ${p.name}`} onClick={() => setConfirm(p)}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
          <Pager page={page} limit={data?.limit || 25} total={data?.total || 0} onPage={setPage} />
        </>
      )}
      {confirm && (
        <Modal open onClose={() => { setConfirm(null); del.reset(); }} title={`Delete panel „${confirm.name}“?`} maxWidth="max-w-md">
          <p className="text-sm text-cs-muted mb-4">Its tickets stay (they lose the panel link). The posted Discord message is not removed by this action. Main Owner only.</p>
          <label className="cs-label" htmlFor="panel-reason">Reason (audit log)</label>
          <input id="panel-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          {del.isError && <p className="text-xs text-danger mt-2" role="alert">{adminErr(del.error)}</p>}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cs-border">
            <button type="button" className="cs-btn-ghost" onClick={() => { setConfirm(null); setReason(""); del.reset(); }}>Cancel</button>
            <button type="button" className="cs-btn-danger" disabled={del.isPending || reason.trim().length < 3} onClick={() => del.mutate(confirm)}>{del.isPending ? "Deleting…" : "Delete panel"}</button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

function FormsList({ serverId, q }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  // Нов филтър → първа страница (иначе страница 3 на новия филтър е празна; ревю 26.09.2026).
  useEffect(() => { setPage(1); }, [serverId, q]);
  const [confirm, setConfirm] = useState(null);
  const [force, setForce] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-forms", serverId, q, page], queryFn: () => getAdminForms({ serverId, q: q || undefined, page, limit: 25 }), placeholderData: (prev) => prev });
  const [reason, setReason] = useState("");
  const del = useMutation({ mutationFn: (f) => deleteAdminForm(f.id, reason.trim(), force), onSuccess: (r) => { toast.success(`Form deleted${r?.applicationsDeleted ? ` with ${r.applicationsDeleted} applications` : ""}.`); setConfirm(null); setForce(false); setReason(""); qc.invalidateQueries({ queryKey: ["admin-forms"] }); }, onError: (e) => toast.error(adminErr(e)) });
  const rows = data?.forms || [];
  const apps = confirm?._count?.applications || 0;
  return (
    <Section title="Forms" icon={LifeBuoy}>
      {isLoading ? <Loading /> : isError ? <LoadError error={error} onRetry={refetch} /> : (
        <>
          <div className="overflow-x-auto"><table className="cs-table"><thead><tr><th>Form</th><th>Server</th><th>Questions</th><th>Applications</th><th>Created</th><th className="text-right">Actions</th></tr></thead><tbody>
            {!rows.length && <tr><td colSpan={6} className="text-cs-dim">No forms match.</td></tr>}
            {rows.map((f) => (
              <tr key={f.id}>
                <td>{f.name}<div className="font-mono text-[10px] text-cs-dim">{f.id}</div></td>
                <td>{f.server?.name}<div className="font-mono text-[10px] text-cs-dim">{f.serverId}</div></td>
                <td className="font-mono text-xs">{f._count?.questions ?? 0}</td>
                <td className="font-mono text-xs">{f._count?.applications ?? 0}</td>
                <td className="text-xs">{fmt(f.createdAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <Link className="cs-btn-ghost cs-btn-sm" to={`/dashboard/${f.serverId}/forms`}><ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Edit</Link>
                  <button type="button" className="cs-btn-ghost cs-btn-sm text-danger" aria-label={`Delete form ${f.name}`} onClick={() => { setForce(false); setConfirm(f); }}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody></table></div>
          <Pager page={page} limit={data?.limit || 25} total={data?.total || 0} onPage={setPage} />
        </>
      )}
      {confirm && (
        <Modal open onClose={() => { setConfirm(null); del.reset(); }} title={`Delete form „${confirm.name}“?`} maxWidth="max-w-md">
          <p className="text-sm text-cs-muted mb-4">The questions are deleted with it. Main Owner only.</p>
          <label className="cs-label" htmlFor="form-reason">Reason (audit log)</label>
          <input id="form-reason" className="cs-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          {apps > 0 && (
            <label className="flex gap-2 items-start text-sm mt-3">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              <span>Also delete its <strong>{apps}</strong> application{apps === 1 ? "" : "s"} (applicants' answers are lost).</span>
            </label>
          )}
          {del.isError && <p className="text-xs text-danger mt-2" role="alert">{adminErr(del.error)}</p>}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-cs-border">
            <button type="button" className="cs-btn-ghost" onClick={() => { setConfirm(null); del.reset(); }}>Cancel</button>
            <button type="button" className="cs-btn-danger" disabled={del.isPending || (apps > 0 && !force) || reason.trim().length < 3} onClick={() => del.mutate(confirm)}>{del.isPending ? "Deleting…" : "Delete form"}</button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

