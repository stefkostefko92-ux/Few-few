import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ROLES, VIP_TIERS } from "@aso/shared";
import { Badge, Button, Field, Modal, Panel } from "../../ui";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";
import { GAME_CATALOG } from "../lobby/games";
import {
  adminApi,
  type AdminMatchItem,
  type AdminUserPatch,
  type AdminUserRow,
} from "./adminApi";
import { ErrorPanel, errorMessage, useLoad } from "./load";

const selectCls =
  "rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-sm text-ink-100";

const gameTitle = (key: string): string =>
  GAME_CATALOG.find((g) => g.key === key)?.title ?? key;

/** Player search + filters + paginated table; row opens a detail modal. */
export function AdminUsers() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [vip, setVip] = useState("");
  const [banned, setBanned] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load(cursor?: string) {
    setLoading(true);
    if (!cursor) setError(null);
    try {
      const r = await adminApi.users({
        q: q.trim(),
        role,
        vip,
        banned: banned as "" | "1" | "0",
        cursor,
      });
      setRows((prev) => (cursor ? [...prev, ...r.users] : r.users));
      setNextCursor(r.nextCursor);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [role, vip, banned]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div>
      <form onSubmit={onSearch} className="mb-4 flex flex-wrap items-end gap-2">
        <Field
          label=""
          aria-label={t("admin.searchUsers")}
          placeholder={t("admin.searchUsers")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-48 flex-1"
        />
        <select
          aria-label={t("admin.role")}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("admin.allRoles", "Всички роли")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="VIP"
          value={vip}
          onChange={(e) => setVip(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("admin.allVip", "Всички VIP")}</option>
          {VIP_TIERS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label={t("admin.status", "Статус")}
          value={banned}
          onChange={(e) => setBanned(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("admin.all", "Всички")}</option>
          <option value="1">{t("admin.onlyBanned", "Само блокирани")}</option>
          <option value="0">{t("admin.onlyActive", "Само активни")}</option>
        </select>
        <Button type="submit">{t("admin.search")}</Button>
      </form>

      {error && rows.length === 0 ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : (
        <>
          <Panel className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-muted">
                <tr className="border-b border-brass-400/15">
                  <th className="px-3 py-2">{t("admin.player")}</th>
                  <th className="px-3 py-2">{t("admin.role")}</th>
                  <th className="px-3 py-2">VIP</th>
                  <th className="px-3 py-2 text-right">🪙</th>
                  <th className="px-3 py-2 text-right">💎</th>
                  <th className="px-3 py-2">{t("admin.lastSeen", "Последно видян")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-brass-400/5 hover:bg-felt-700/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 text-ink-100">
                        {u.displayName}
                        {u.banned ? (
                          <Badge
                            tone="vip"
                            className="!bg-loss/15 !text-loss !border-loss/40"
                            title={u.banReason ?? undefined}
                          >
                            BAN
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-ink-muted">{u.email}</div>
                    </td>
                    <td className="px-3 py-2 text-ink-300">{u.role}</td>
                    <td className="px-3 py-2">{u.vipTier !== "NONE" ? <Badge tone="vip">{u.vipTier}</Badge> : "—"}</td>
                    <td className="px-3 py-2 text-right tnum text-ink-300">{u.chips}</td>
                    <td className="px-3 py-2 text-right tnum text-ink-300">{u.gems}</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">
                      {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString(i18n.language) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" onClick={() => setOpenId(u.id)}>
                        {t("admin.manage")}
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                      {t("admin.noUsers")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Panel>
          {loading ? <p className="mt-3 text-center text-sm text-ink-muted">{t("common.loading")}</p> : null}
          {error && rows.length > 0 ? (
            <p className="mt-3 text-center text-sm text-loss">{errorMessage(error)}</p>
          ) : null}
          {nextCursor && !loading ? (
            <Button variant="ghost" className="mt-3 w-full" onClick={() => void load(nextCursor)}>
              {t("admin.loadMore")}
            </Button>
          ) : null}
        </>
      )}

      {openId ? (
        <UserDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}

const GRANT_NOTE_THRESHOLD = 10_000;

/** Full player dossier + staff actions. Also opened from the Flags tab. */
export function UserDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canWrite = isAdmin(meRole);

  const { data: detail, error, loading, reload } = useLoad(() => adminApi.user(id), [id]);
  const [role, setRole] = useState("");
  const [vip, setVip] = useState("");
  const [chips, setChips] = useState("");
  const [gems, setGems] = useState("");
  const [note, setNote] = useState("");
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banUntil, setBanUntil] = useState(""); // yyyy-mm-dd from <input type=date>
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "err">("ok");

  useEffect(() => {
    if (detail) {
      setRole(detail.user.role);
      setVip(detail.user.vipTier);
    }
  }, [detail]);

  async function patch(body: AdminUserPatch, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      await adminApi.updateUser(id, body);
      setMsgTone("ok");
      setMsg(okMsg);
      setChips("");
      setGems("");
      setNote("");
      setBanOpen(false);
      setBanReason("");
      setBanUntil("");
      reload();
      onChanged();
    } catch (e) {
      setMsgTone("err");
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function grant(kind: "chips" | "gems") {
    const raw = kind === "chips" ? chips : gems;
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n === 0) return;
    const trimmedNote = note.trim();
    if (Math.abs(n) > GRANT_NOTE_THRESHOLD) {
      if (!trimmedNote) {
        setMsgTone("err");
        setMsg(t("admin.grantNoteRequired", "При суми над 10 000 причината е задължителна."));
        return;
      }
      if (!window.confirm(t("admin.grantConfirmBig", "Голяма сума — сигурен ли си?"))) return;
    }
    void patch(
      {
        ...(kind === "chips" ? { grantChips: n } : { grantGems: n }),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      t("admin.granted"),
    );
  }

  function submitBan() {
    const reason = banReason.trim();
    if (!reason) {
      setMsgTone("err");
      setMsg(t("admin.banReasonRequired", "Въведи причина за блокирането."));
      return;
    }
    void patch(
      {
        banned: true,
        banReason: reason,
        banUntil: banUntil ? new Date(`${banUntil}T23:59:59`).toISOString() : null,
      },
      t("admin.saved"),
    );
  }

  const u = detail?.user;

  return (
    <Modal open onClose={onClose} title={u ? u.displayName : "…"}>
      {error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : u ? (
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="text-xs text-ink-muted">
            {u.email}
            {u.emailVerified ? " ✓" : ""}
          </div>

          {u.banned ? (
            <div className="rounded-card border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
              <div className="font-semibold">
                {t("admin.banned")}
                {" · "}
                {u.banUntil
                  ? `${t("admin.banUntil", "Блокиран до")}: ${new Date(u.banUntil).toLocaleString(i18n.language)}`
                  : t("admin.banPermanent", "Постоянен")}
              </div>
              {u.banReason ? <div className="text-xs">{u.banReason}</div> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm text-ink-300">
            <Stat label="🪙" value={u.chips} />
            <Stat label="💎" value={String(u.gems)} />
            <Stat label={t("admin.level")} value={`${u.level} (${u.xp} XP)`} />
            <Stat label={t("admin.matches")} value={String(u._count?.matches ?? 0)} />
            <Stat
              label={t("admin.registered", "Регистриран")}
              value={u.createdAt ? new Date(u.createdAt).toLocaleDateString(i18n.language) : "—"}
            />
            <Stat
              label={t("admin.lastSeen", "Последно видян")}
              value={u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString(i18n.language) : "—"}
            />
          </div>

          {canWrite ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm text-ink-300">
                  {t("admin.role")}
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink-300">
                  VIP
                  <select value={vip} onChange={(e) => setVip(e.target.value)} className={selectCls}>
                    {VIP_TIERS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>

              <Button
                loading={busy}
                onClick={() => patch({ role, vipTier: vip }, t("admin.saved"))}
                className="w-full"
              >
                {t("admin.saveRoleVip")}
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <GrantBox
                  label={t("admin.grantChips")}
                  value={chips}
                  onChange={setChips}
                  onApply={() => grant("chips")}
                  busy={busy}
                />
                <GrantBox
                  label={t("admin.grantGems")}
                  value={gems}
                  onChange={setGems}
                  onApply={() => grant("gems")}
                  busy={busy}
                />
              </div>
              <Field
                label={t("admin.grantNote", "Причина (бележка за одита)")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("admin.grantNotePlaceholder", "напр. компенсация за прекъснат мач")}
                maxLength={300}
              />

              {u.banned ? (
                <Button
                  variant="felt"
                  loading={busy}
                  onClick={() => patch({ banned: false }, t("admin.saved"))}
                  className="w-full"
                >
                  {t("admin.unban")}
                </Button>
              ) : banOpen ? (
                <div className="flex flex-col gap-2 rounded-card border border-loss/40 bg-loss/5 p-3">
                  <Field
                    label={t("admin.banReason", "Причина за блокиране")}
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    maxLength={500}
                    autoFocus
                  />
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-300">
                    {t("admin.banUntilLabel", "Блокиран до (празно = постоянен)")}
                    <input
                      type="date"
                      value={banUntil}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setBanUntil(e.target.value)}
                      className={selectCls}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button loading={busy} onClick={submitBan} className="flex-1 !bg-loss">
                      {t("admin.banConfirm", "Блокирай акаунта")}
                    </Button>
                    <Button variant="ghost" onClick={() => setBanOpen(false)}>
                      {t("admin.cancel", "Отказ")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setBanOpen(true)} className="w-full !text-loss">
                  {t("admin.ban")}
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("admin.readOnly")}</p>
          )}

          {msg ? (
            <p className={`text-center text-sm ${msgTone === "ok" ? "text-win" : "text-loss"}`}>{msg}</p>
          ) : null}

          {u.ratings.length ? (
            <Section title={t("admin.ratings", "Рейтинги")}>
              <ul className="space-y-1 text-xs text-ink-300">
                {u.ratings.map((r) => (
                  <li key={r.game} className="flex justify-between">
                    <span>{gameTitle(r.game)}</span>
                    <span className="tnum">
                      MMR {r.mmr} · {r.wins}/{r.games}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("admin.purchases")}>
            {u.purchases.length === 0 ? (
              <p className="text-xs text-ink-muted">{t("admin.noPurchases", "Няма покупки.")}</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-ink-300">
                {u.purchases.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {p.product.sku} · {p.status}
                    </span>
                    <span className="tnum text-ink-muted">
                      €{(p.product.priceCents / 100).toFixed(2)} ·{" "}
                      {new Date(p.createdAt).toLocaleDateString(i18n.language)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("admin.matchHistory", "История на мачовете")}>
            <MatchHistory userId={id} />
          </Section>

          {detail.audits.length ? (
            <Section title={t("admin.history")}>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-ink-300">
                {detail.audits.map((a) => (
                  <li key={a.id}>
                    <span className="text-brass-300">{a.action}</span> · {a.actorName} ·{" "}
                    {new Date(a.createdAt).toLocaleString(i18n.language)}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-ink-muted">{t("common.loading")}</p>
      ) : null}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-brass-400/10 pt-3">
      <h4 className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{title}</h4>
      {children}
    </div>
  );
}

function MatchHistory({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<AdminMatchItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load(c?: string) {
    setLoading(true);
    if (!c) setError(null);
    try {
      const r = await adminApi.userMatches(userId, c);
      setItems((prev) => (c ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    void load();
  }, [userId]);

  if (loading && items.length === 0) return <p className="text-xs text-ink-muted">{t("common.loading")}</p>;
  if (error && items.length === 0)
    return (
      <p className="text-xs text-loss">
        {errorMessage(error)}{" "}
        <button type="button" className="underline" onClick={() => void load()}>
          {t("admin.retry", "Опитай пак")}
        </button>
      </p>
    );
  if (items.length === 0) return <p className="text-xs text-ink-muted">{t("admin.noMatches", "Няма изиграни мачове.")}</p>;

  return (
    <div className="flex flex-col gap-2">
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-ink-300">
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-2">
            <span>
              {gameTitle(m.game)}
              <span className="text-ink-muted"> · {m.mode}</span>
              {m.result ? (
                <span className={m.result === "win" ? "text-win" : m.result === "loss" ? "text-loss" : "text-ink-muted"}>
                  {" "}
                  · {m.result}
                </span>
              ) : null}
            </span>
            <span className="tnum text-ink-muted">
              {Number(m.chipsDelta) !== 0 ? `${Number(m.chipsDelta) > 0 ? "+" : ""}${m.chipsDelta} 🪙 · ` : ""}
              {m.mmrDelta !== 0 ? `${m.mmrDelta > 0 ? "+" : ""}${m.mmrDelta} MMR · ` : ""}
              {new Date(m.startedAt).toLocaleString(i18n.language)}
            </span>
          </li>
        ))}
      </ul>
      {cursor ? (
        <button
          type="button"
          className="text-xs text-brass-300 underline"
          onClick={() => void load(cursor)}
          disabled={loading}
        >
          {t("admin.loadMore")}
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-brass-400/10 bg-felt-800/50 px-3 py-2">
      <span className="text-ink-muted">{label}</span> <span className="tnum text-ink-100">{value}</span>
    </div>
  );
}

function GrantBox({
  label,
  value,
  onChange,
  onApply,
  busy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Field
        label={label}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="±0"
      />
      <Button variant="felt" loading={busy} disabled={!value || Number.isNaN(Number(value))} onClick={onApply}>
        +/−
      </Button>
    </div>
  );
}
