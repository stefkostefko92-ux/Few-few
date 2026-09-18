import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Modal, Panel } from "../../ui";
import { ACCOUNT_EXPORT_URL, api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { getFourColor, setFourColor } from "../../lib/a11y";
import { Achievements } from "../progression/Achievements";

/** Player account & privacy controls (GDPR: data export + erasure). */
export function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fourColor, setFourColorState] = useState(getFourColor());

  if (!user) return null;

  async function onDelete() {
    setBusy(true);
    try {
      await api.deleteAccount();
      setUser(null);
      navigate("/login", { replace: true });
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-4xl text-brass-300">{t("account.title")}</h1>

      <Panel className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl text-ink-100">{user.displayName}</div>
            <div className="text-sm text-ink-muted">{user.email}</div>
          </div>
          <div className="flex items-center gap-2">
            {user.vipTier !== "NONE" ? <Badge tone="vip">VIP {user.vipTier}</Badge> : null}
            <Badge tone={user.emailVerified ? "brass" : "felt"}>
              {user.emailVerified ? t("account.verified") : t("account.unverified")}
            </Badge>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label={t("wallet.chips")} value={user.chips} />
          <Stat label={t("wallet.gems")} value={String(user.gems)} />
          <Stat label={t("account.level")} value={String(user.level)} />
        </div>
      </Panel>

      <Achievements />

      <Panel className="mb-6">
        <h2 className="text-xl text-ink-100">{t("a11y.title", { defaultValue: "Достъпност" })}</h2>
        <label className="mt-3 flex items-center justify-between gap-4">
          <span>
            <span className="text-ink-100">{t("a11y.fourColor", { defaultValue: "Четирицветно тесте" })}</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              {t("a11y.fourColorHint", {
                defaultValue: "Различен цвят за всяка боя — помага при далтонизъм.",
              })}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={fourColor}
            onClick={() => {
              const next = !fourColor;
              setFourColorState(next);
              setFourColor(next);
            }}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
              fourColor ? "border-brass-300 bg-brass-300" : "border-brass-300/40 bg-felt-800"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-felt-900 transition-all ${
                fourColor ? "left-6" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </Panel>

      <Panel>
        <h2 className="text-xl text-ink-100">{t("account.privacy")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("account.privacyHint")}</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <a
            href={ACCOUNT_EXPORT_URL}
            download
            className="inline-flex flex-1 items-center justify-center rounded-card border border-brass-400/25 bg-felt-800 px-5 py-2.5 font-semibold text-ink-100 hover:border-brass-300"
          >
            {t("account.exportData")}
          </a>
          <Button variant="ghost" onClick={() => setConfirmOpen(true)} className="flex-1 !text-loss">
            {t("account.deleteAccount")}
          </Button>
        </div>
      </Panel>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("account.deleteTitle")}>
        <p className="text-ink-300">{t("account.deleteBody")}</p>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)} className="flex-1">
            {t("account.cancel")}
          </Button>
          <Button loading={busy} onClick={onDelete} className="flex-1 !bg-loss">
            {t("account.confirmDelete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-brass-400/10 bg-felt-800/50 px-3 py-2">
      <div className="tnum text-lg text-ink-100">{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
