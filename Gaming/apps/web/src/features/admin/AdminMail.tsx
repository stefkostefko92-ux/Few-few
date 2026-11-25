import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BREVO_DEFAULTS, MAIL_PORTS, type MailSettingsView, type MailTestResult } from "@aso/shared";
import { Badge, Button, Panel } from "../../ui";
import { adminApi } from "./adminApi";
import { ErrorPanel, errorMessage, useLoad } from "./load";

const field =
  "w-full rounded-card border border-brass-400/20 bg-felt-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brass-300";

interface Form {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

const fromView = (v: MailSettingsView): Form =>
  v.settings
    ? { ...v.settings, password: "" }
    : {
        host: BREVO_DEFAULTS.host,
        port: BREVO_DEFAULTS.port,
        username: "",
        password: "",
        fromName: BREVO_DEFAULTS.fromName,
        fromEmail: BREVO_DEFAULTS.fromEmail,
      };

/**
 * „Имейл (Brevo)“ — пощата на портала от админ панела, по модела на Rilievi
 * Impianti. Само OWNER. Оттук тръгват всички писма (потвърждение на имейл, нова
 * парола), затова записът и изключването искат паролата на акаунта. SMTP ключът
 * само се пише: никога не се показва; празно поле = остава записаният.
 */
export function AdminMail() {
  const { t, i18n } = useTranslation();
  const { data, error, loading, reload } = useLoad(() => adminApi.mail(), []);
  const [view, setView] = useState<MailSettingsView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "disable" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setView(data);
      setForm(fromView(data));
    }
  }, [data]);

  if (error) return <ErrorPanel error={error} onRetry={reload} />;
  if (loading || !view || !form) return <p className="text-ink-muted">{t("common.loading")}</p>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const fail = (e: unknown) => {
    const code = (e as { code?: string }).code;
    const known = code && i18n.exists(`admin.mail.err.${code}`) ? t(`admin.mail.err.${code}`) : errorMessage(e);
    setNotice({ ok: false, text: known });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy("save");
    setNotice(null);
    try {
      const v = await adminApi.saveMail({ ...form, accountPassword });
      setView(v);
      setForm(fromView(v));
      setAccountPassword("");
      setNotice({ ok: true, text: t("admin.mail.saved") });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setNotice(null);
    try {
      const r: MailTestResult = await adminApi.testMail();
      if (r.result === "sent") setNotice({ ok: true, text: t("admin.mail.testSent", { email: r.to }) });
      else if (r.result === "disabled") setNotice({ ok: false, text: t("admin.mail.testDisabled") });
      else setNotice({ ok: false, text: t("admin.mail.testError", { code: r.code }) });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    setNotice(null);
    try {
      const v = await adminApi.disableMail(accountPassword);
      setView(v);
      setAccountPassword("");
      setNotice({ ok: true, text: t("admin.mail.disabled") });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const sourceText =
    view.source === "console"
      ? t("admin.mail.sourceConsole")
      : view.source === "env"
        ? t("admin.mail.sourceEnv")
        : t("admin.mail.sourceNone");

  return (
    <Panel data-testid="admin-mail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl text-ink-100">{t("admin.mail.title")}</h2>
        <Badge tone={view.source === "console" ? "brass" : "felt"} data-testid="mail-source" data-source={view.source ?? "none"}>
          {sourceText}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t("admin.mail.hint")}</p>
      {view.settings ? (
        <p className="mt-1 text-xs text-ink-muted">
          {t("admin.mail.updated", {
            date: new Date(view.settings.updatedAt).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }),
            who: view.settings.updatedBy ?? "—",
          })}
          {view.settings.active ? "" : ` · ${t("admin.mail.inactive")}`}
        </p>
      ) : null}
      {!view.keyReady ? (
        <p className="mt-3 rounded-card border border-loss/40 px-3 py-2 text-sm text-loss" role="alert">
          {t("admin.mail.keyMissing")}
        </p>
      ) : null}

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={save} autoComplete="off">
        <label className="text-sm text-ink-300">
          {t("admin.mail.host")}
          <input className={field} value={form.host} onChange={(e) => set("host", e.target.value)} required maxLength={253} />
        </label>
        <label className="text-sm text-ink-300">
          {t("admin.mail.port")}
          <select className={field} value={form.port} onChange={(e) => set("port", Number(e.target.value))}>
            {MAIL_PORTS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.mail.port${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-300">
          {t("admin.mail.username")}
          <input
            className={field}
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            required
            maxLength={254}
            autoComplete="off"
          />
        </label>
        <label className="text-sm text-ink-300">
          {t("admin.mail.password")}
          <input
            className={field}
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            maxLength={512}
            autoComplete="new-password"
            placeholder={view.hasPassword ? t("admin.mail.passwordKeep") : ""}
            data-testid="mail-key"
          />
        </label>
        <label className="text-sm text-ink-300">
          {t("admin.mail.fromName")}
          <input className={field} value={form.fromName} onChange={(e) => set("fromName", e.target.value)} required maxLength={80} />
        </label>
        <label className="text-sm text-ink-300">
          {t("admin.mail.fromEmail")}
          <input
            className={field}
            type="email"
            value={form.fromEmail}
            onChange={(e) => set("fromEmail", e.target.value)}
            required
            maxLength={254}
          />
        </label>
        <p className="text-xs text-ink-muted sm:col-span-2">{t("admin.mail.brevoHelp")}</p>
        <label className="text-sm text-ink-300 sm:col-span-2">
          {t("admin.mail.accountPassword")}
          <input
            className={field}
            type="password"
            value={accountPassword}
            onChange={(e) => setAccountPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="mail-account-password"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy !== null || !view.keyReady || !accountPassword} data-action="mail-save">
            {t("admin.mail.save")}
          </Button>
          <Button type="button" variant="felt" disabled={busy !== null} onClick={test} data-action="mail-test">
            {t("admin.mail.test")}
          </Button>
          {view.settings?.active ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null || !accountPassword}
              onClick={disable}
              data-action="mail-disable"
            >
              {t("admin.mail.disable")}
            </Button>
          ) : null}
        </div>
      </form>
      {notice ? (
        <p className={`mt-3 text-sm ${notice.ok ? "text-win" : "text-loss"}`} role="status" data-testid="mail-notice">
          {notice.text}
        </p>
      ) : null}
    </Panel>
  );
}
