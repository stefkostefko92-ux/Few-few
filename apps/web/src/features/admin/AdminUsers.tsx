import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ROLES, VIP_TIERS } from "@aso/shared";
import { Badge, Button, Field, Modal, Panel } from "../../ui";
import { api, type AdminUserDetail, type AdminUserRow } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { isAdmin } from "../../app/RequireRole";

/** Player search + table; row opens a detail modal with staff actions. */
export function AdminUsers() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = (query: string) => api.adminUsers(query).then((r) => setRows(r.users)).catch(() => undefined);
  useEffect(() => {
    void load("");
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(q);
  }

  return (
    <div>
      <form onSubmit={onSearch} className="mb-4 flex gap-2">
        <Field
          label=""
          aria-label={t("admin.searchUsers")}
          placeholder={t("admin.searchUsers")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1"
        />
        <Button type="submit">{t("admin.search")}</Button>
      </form>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted">
            <tr className="border-b border-brass-400/15">
              <th className="px-3 py-2">{t("admin.player")}</th>
              <th className="px-3 py-2">{t("admin.role")}</th>
              <th className="px-3 py-2">VIP</th>
              <th className="px-3 py-2 text-right">🪙</th>
              <th className="px-3 py-2 text-right">💎</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-brass-400/5 hover:bg-felt-700/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 text-ink-100">
                    {u.displayName}
                    {u.banned ? <Badge tone="vip" className="!bg-loss/15 !text-loss !border-loss/40">BAN</Badge> : null}
                  </div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </td>
                <td className="px-3 py-2 text-ink-300">{u.role}</td>
                <td className="px-3 py-2">{u.vipTier !== "NONE" ? <Badge tone="vip">{u.vipTier}</Badge> : "—"}</td>
                <td className="px-3 py-2 text-right tnum text-ink-300">{u.chips}</td>
                <td className="px-3 py-2 text-right tnum text-ink-300">{u.gems}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" onClick={() => setOpenId(u.id)}>
                    {t("admin.manage")}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                  {t("admin.noUsers")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>

      {openId ? (
        <UserDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load(q)}
        />
      ) : null}
    </div>
  );
}

function UserDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const meRole = useAuthStore((s) => s.user?.role);
  const canWrite = isAdmin(meRole);

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [role, setRole] = useState("");
  const [vip, setVip] = useState("");
  const [banned, setBanned] = useState(false);
  const [chips, setChips] = useState("");
  const [gems, setGems] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () =>
    api.adminUser(id).then((d) => {
      setDetail(d);
      setRole(d.user.role);
      setVip(d.user.vipTier);
      setBanned(d.user.banned);
    });

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [id]);

  async function patch(body: Parameters<typeof api.adminUpdateUser>[1], note: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminUpdateUser(id, body);
      setMsg(note);
      setChips("");
      setGems("");
      await reload();
      onChanged();
    } catch {
      setMsg(t("admin.actionError"));
    } finally {
      setBusy(false);
    }
  }

  const u = detail?.user;

  return (
    <Modal open onClose={onClose} title={u ? u.displayName : "…"}>
      {u ? (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-ink-muted">{u.email}</div>

          <div className="grid grid-cols-2 gap-3 text-sm text-ink-300">
            <Stat label="🪙" value={u.chips} />
            <Stat label="💎" value={String(u.gems)} />
            <Stat label={t("admin.level")} value={String(u.level)} />
            <Stat label={t("admin.matches")} value={String(u._count?.matches ?? 0)} />
          </div>

          {canWrite ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm text-ink-300">
                  {t("admin.role")}
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-ink-100"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink-300">
                  VIP
                  <select
                    value={vip}
                    onChange={(e) => setVip(e.target.value)}
                    className="rounded-card border border-brass-400/20 bg-felt-900/60 px-2 py-2 text-ink-100"
                  >
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
                  onApply={() => patch({ grantChips: Number(chips) }, t("admin.granted"))}
                  busy={busy}
                />
                <GrantBox
                  label={t("admin.grantGems")}
                  value={gems}
                  onChange={setGems}
                  onApply={() => patch({ grantGems: Number(gems) }, t("admin.granted"))}
                  busy={busy}
                />
              </div>

              <Button
                variant={banned ? "felt" : "ghost"}
                loading={busy}
                onClick={() => patch({ banned: !banned }, t("admin.saved"))}
                className={banned ? "w-full" : "w-full !text-loss"}
              >
                {banned ? t("admin.unban") : t("admin.ban")}
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{t("admin.readOnly")}</p>
          )}

          {msg ? <p className="text-center text-sm text-win">{msg}</p> : null}

          {detail.audits.length ? (
            <div className="mt-2 border-t border-brass-400/10 pt-3">
              <h4 className="mb-2 text-xs uppercase tracking-wide text-ink-muted">{t("admin.history")}</h4>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-ink-300">
                {detail.audits.map((a) => (
                  <li key={a.id}>
                    <span className="text-brass-300">{a.action}</span> · {a.actorName} ·{" "}
                    {new Date(a.createdAt).toLocaleString("bg-BG")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-ink-muted">{t("common.loading")}</p>
      )}
    </Modal>
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
