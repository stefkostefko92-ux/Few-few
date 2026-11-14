"use client";

// Настройки (само администратор; одиторът ги вижда само за четене — Прил. № 29, т. 19):
// търговец и обект, работно място, фискално устройство и режим СУПТО, ПОС терминал,
// правила на касата, евро и ДДС, лиценз, оператори с роли и периоди на активност.

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Plus, Receipt, FileText, ShieldCheck, Warning } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { ROLES } from "@/lib/constants";

interface Settings {
  store: {
    name: string;
    eik: string;
    vatNumber: string;
    mol: string;
    code: string;
    storeName: string;
    address: string;
    city: string;
    phone: string;
    footerText: string;
  };
  fiscal: {
    driver: string;
    deviceSerial: string;
    fiscalMemoryNumber: string;
    host: string;
    port: number;
    printerId: string;
    suptoMode: boolean;
    suptoSince?: string | null;
  };
  terminal: {
    driver: string;
    host: string;
    port: number;
    apiKey: string;
    merchantCode: string;
    readerId: string;
  };
  display: { dualDisplay: boolean; dualDisplayEnd: string };
  vatRates: { A: number; B: number; C: number; D: number };
  workplace: { code: string; name: string };
  pos: { maxCashierDiscountPermille: number };
  fiscalDrivers: Array<{ id: string; label: string }>;
  terminalDrivers: Array<{ id: string; label: string }>;
}

interface RoleGrant {
  role: keyof typeof ROLES;
  readOnly: boolean;
  validFrom: string;
  validTo: string | null;
}

interface User {
  id: string;
  name: string;
  operatorCode: number;
  role: keyof typeof ROLES;
  readOnly: boolean;
  active: boolean;
  deactivatedAt: string | null;
  roleGrants: RoleGrant[];
}

const roleName = (role: keyof typeof ROLES, readOnly: boolean) => (readOnly ? "Одитор (само четене)" : ROLES[role]);

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<{
    fiscal: { ok: boolean; detail: string };
    terminal: { ok: boolean; detail: string } | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userModal, setUserModal] = useState<User | "new" | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; text: string } | null>(null);
  const [serverSupto, setServerSupto] = useState(false);
  const [suptoConfirm, setSuptoConfirm] = useState(false);

  async function load() {
    const [st, us, fs] = await Promise.all([
      apiJson<Settings>(await fetch("/api/settings")),
      apiJson<{ users: User[] }>(await fetch("/api/users")),
      apiJson<{
        fiscal: { ok: boolean; detail: string };
        terminal: { ok: boolean; detail: string } | null;
      }>(await fetch("/api/fiscal")),
    ]);
    setSettings(st);
    setServerSupto(st.fiscal.suptoMode);
    setUsers(us.users);
    setStatus(fs);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save(override?: Partial<Pick<Settings, "fiscal">>) {
    if (!settings) return;
    const values = { ...settings, ...override };
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiJson(
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store: values.store,
            fiscal: values.fiscal,
            terminal: values.terminal,
            display: values.display,
            vatRates: values.vatRates,
            workplace: values.workplace,
            pos: values.pos,
          }),
        })
      );
      setMessage("Настройките са записани.");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при запис.");
    } finally {
      setBusy(false);
    }
  }

  // Преглед на примерен документ с ТЕКУЩИТЕ (незаписани) фирмени данни.
  async function preview(kind: "receipt" | "invoice") {
    if (!settings) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ title: string; text: string }>(
        await fetch("/api/settings/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, store: settings.store, vatRates: settings.vatRates }),
        })
      );
      setPreviewDoc(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при преглед.");
    } finally {
      setPreviewBusy(false);
    }
  }

  if (error && !settings) return <p className="text-coral-600">{error}</p>;
  if (!settings) return <Spinner label="Зареждане на настройките…" />;

  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) =>
    setSettings((s) => (s ? { ...s, [key]: { ...(s[key] as object), ...patch } } : s));

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Настройки</h1>
        <button onClick={() => void save()} disabled={busy} className="btn-primary">
          {busy ? "Записва се…" : "Запази всички"}
        </button>
      </div>

      {message && (
        <div className="bg-mint-600/10 border border-mint-600/30 text-mint-600 rounded-xl px-4 py-3 text-sm font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-coral-600/10 border border-coral-600/30 text-coral-600 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Фирмени данни (реквизити на бона и фактурата) */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-lg">Данни на фирмата</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Реквизити на фискалния бон (чл. 26 Н-18) и на фактурата (чл. 114 ЗДДС).
            Печатат се на всеки документ.
          </p>
        </div>

        <h3 className="text-sm font-semibold text-ink-300 uppercase tracking-wide">Юридическо лице</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Наименование (юридическо лице)">
            <input value={settings.store.name} onChange={(e) => set("store", { name: e.target.value })} className="input w-full" />
          </Field>
          <Field label="МОЛ / представляващ (Съставил фактура)">
            <input value={settings.store.mol} onChange={(e) => set("store", { mol: e.target.value })} className="input w-full" />
          </Field>
          <Field label="ЕИК">
            <input value={settings.store.eik} onChange={(e) => set("store", { eik: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="ЗДДС номер (празно, ако не сте регистрирани)">
            <input value={settings.store.vatNumber} onChange={(e) => set("store", { vatNumber: e.target.value })} className="input w-full font-mono" />
          </Field>
        </div>

        <h3 className="text-sm font-semibold text-ink-300 uppercase tracking-wide pt-1">Търговски обект</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Код на обекта (в справките по т. 18)">
            <input value={settings.store.code} onChange={(e) => set("store", { code: e.target.value })} className="input w-full font-mono" maxLength={10} />
          </Field>
          <Field label="Работно място: код и име">
            <div className="flex gap-2">
              <input value={settings.workplace.code} onChange={(e) => set("workplace", { code: e.target.value })} className="input w-24 font-mono" maxLength={10} aria-label="Код на работното място" />
              <input value={settings.workplace.name} onChange={(e) => set("workplace", { name: e.target.value })} className="input flex-1" maxLength={60} aria-label="Име на работното място" />
            </div>
          </Field>
          <Field label="Име на обекта">
            <input value={settings.store.storeName} onChange={(e) => set("store", { storeName: e.target.value })} className="input w-full" />
          </Field>
          <Field label="Телефон (по избор)">
            <input value={settings.store.phone} onChange={(e) => set("store", { phone: e.target.value })} className="input w-full" inputMode="tel" />
          </Field>
          <Field label="Град">
            <input value={settings.store.city} onChange={(e) => set("store", { city: e.target.value })} className="input w-full" />
          </Field>
          <Field label="Адрес на обекта">
            <input value={settings.store.address} onChange={(e) => set("store", { address: e.target.value })} className="input w-full" />
          </Field>
        </div>

        <Field label="Текст на дъното на бона (по избор)">
          <input
            value={settings.store.footerText}
            onChange={(e) => set("store", { footerText: e.target.value })}
            className="input w-full"
            placeholder="напр. Благодарим Ви за покупката!"
            maxLength={120}
          />
        </Field>

        <div className="flex flex-wrap gap-3 pt-1">
          <button onClick={() => void preview("receipt")} disabled={previewBusy} className="btn-ghost text-sm">
            <Receipt size={16} /> Преглед на бон
          </button>
          <button onClick={() => void preview("invoice")} disabled={previewBusy} className="btn-ghost text-sm">
            <FileText size={16} /> Преглед на фактура
          </button>
        </div>
      </section>

      {/* Фискално устройство */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Фискално устройство</h2>
          {status && (
            <Badge tone={status.fiscal.ok ? "success" : "danger"}>
              {status.fiscal.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {status.fiscal.detail}
            </Badge>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Драйвер">
            <select
              value={settings.fiscal.driver}
              onChange={(e) => set("fiscal", { driver: e.target.value })}
              className="input w-full"
            >
              {settings.fiscalDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Индивидуален № на ФУ (в УНП)">
            <input value={settings.fiscal.deviceSerial} onChange={(e) => set("fiscal", { deviceSerial: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="№ на фискална памет">
            <input value={settings.fiscal.fiscalMemoryNumber} onChange={(e) => set("fiscal", { fiscalMemoryNumber: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="Адрес (мост / устройство)">
            <input value={settings.fiscal.host} onChange={(e) => set("fiscal", { host: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="Порт (ErpNet.FP 8001 · ZFPLab 4444)">
            <input
              value={String(settings.fiscal.port)}
              onChange={(e) => set("fiscal", { port: parseInt(e.target.value, 10) || 0 })}
              className="input w-full font-mono"
              inputMode="numeric"
            />
          </Field>
          <Field label="Printer ID (за ErpNet.FP)">
            <input value={settings.fiscal.printerId} onChange={(e) => set("fiscal", { printerId: e.target.value })} className="input w-full font-mono" />
          </Field>
        </div>
        {serverSupto ? (
          <div className="flex items-start gap-3 rounded-2xl bg-mint-600/10 border border-mint-600/30 px-4 py-3">
            <ShieldCheck size={22} weight="duotone" className="text-mint-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-ink-100">
                Режим СУПТО е включен
                {settings.fiscal.suptoSince ? ` от ${new Date(settings.fiscal.suptoSince).toLocaleDateString("bg-BG")}` : ""}
              </div>
              <div className="text-ink-400">
                Всеки бон носи УНП, демо устройствата са забранени, а режимът не може да се изключи (Прил. № 29, т. 10 и 20).
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-600/10 border border-brand-600/30 px-4 py-3">
            <Warning size={22} weight="duotone" className="text-brand-700 shrink-0" />
            <div className="text-sm flex-1 min-w-[16rem]">
              <div className="font-semibold text-ink-100">Демонстрация: режимът СУПТО е изключен</div>
              <div className="text-ink-400">Включете го, когато касата работи с истинско фискално устройство.</div>
            </div>
            <button className="btn-primary text-sm" onClick={() => setSuptoConfirm(true)}>
              Включи режим СУПТО
            </button>
          </div>
        )}
      </section>

      <Modal open={suptoConfirm} onClose={() => setSuptoConfirm(false)} title="Включване на режим СУПТО">
        <div className="space-y-4 text-sm">
          <p>След включване касата работи по Приложение № 29 на Наредба № Н-18:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-ink-300">
            <li>всеки бон и всяко сторно носят уникален номер на продажбата (УНП);</li>
            <li>демо фискално устройство и демо терминал не могат да се ползват;</li>
            <li>режимът <b className="text-ink-100">не може да се изключи</b> по-късно.</li>
          </ul>
          <p className="text-ink-400">
            Текущ драйвер на ФУ: <b className="text-ink-100">{settings.fiscalDrivers.find((d) => d.id === settings.fiscal.driver)?.label}</b>.
            Незаписаните промени по страницата се записват заедно с режима.
          </p>
          <button
            className="btn-primary w-full h-12"
            disabled={busy}
            onClick={() => {
              setSuptoConfirm(false);
              void save({ fiscal: { ...settings.fiscal, suptoMode: true } });
            }}
          >
            Включи режим СУПТО
          </button>
        </div>
      </Modal>

      {/* Терминал */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">ПОС терминал (карти)</h2>
          {status?.terminal && (
            <Badge tone={status.terminal.ok ? "success" : "danger"}>
              {status.terminal.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {status.terminal.detail}
            </Badge>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Драйвер">
            <select
              value={settings.terminal.driver}
              onChange={(e) => set("terminal", { driver: e.target.value })}
              className="input w-full"
            >
              {settings.terminalDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="IP адрес (myPOS ECR)">
            <input value={settings.terminal.host} onChange={(e) => set("terminal", { host: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="Порт (7900 Android / 60180 K300)">
            <input
              value={String(settings.terminal.port)}
              onChange={(e) => set("terminal", { port: parseInt(e.target.value, 10) || 0 })}
              className="input w-full font-mono"
              inputMode="numeric"
            />
          </Field>
          <Field label="API ключ (SumUp)">
            <input value={settings.terminal.apiKey} onChange={(e) => set("terminal", { apiKey: e.target.value })} className="input w-full font-mono" type="password" />
          </Field>
          <Field label="Merchant code (SumUp)">
            <input value={settings.terminal.merchantCode} onChange={(e) => set("terminal", { merchantCode: e.target.value })} className="input w-full font-mono" />
          </Field>
          <Field label="Reader ID (SumUp)">
            <input value={settings.terminal.readerId} onChange={(e) => set("terminal", { readerId: e.target.value })} className="input w-full font-mono" />
          </Field>
        </div>
      </section>

      {/* Правила на касата */}
      <section className="card p-5 space-y-4">
        <h2 className="font-bold text-lg">Правила на касата</h2>
        <Field label="Най-голяма ръчна отстъпка, която касиер дава без управител (%)">
          <input
            value={String(settings.pos.maxCashierDiscountPermille / 10)}
            onChange={(e) =>
              set("pos", { maxCashierDiscountPermille: Math.min(999, Math.max(0, Math.round((parseFloat(e.target.value.replace(",", ".")) || 0) * 10))) })
            }
            className="input w-40 text-center font-mono"
            inputMode="decimal"
          />
        </Field>
        <p className="text-xs text-ink-500">
          По-голяма отстъпка се отказва на сървъра и иска вход на управител. Отстъпката от клиентска карта не се брои.
        </p>
      </section>

      {/* Евро / ДДС */}
      <section className="card p-5 space-y-4">
        <h2 className="font-bold text-lg">Евро и ДДС</h2>
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={settings.display.dualDisplay}
            onChange={(e) => set("display", { dualDisplay: e.target.checked })}
            className="size-5 accent-brand-500"
          />
          <span className="font-medium">
            Двойно обозначаване EUR/BGN по курс 1.95583 (задължително до{" "}
            {new Date(settings.display.dualDisplayEnd).toLocaleDateString("bg-BG")} — ЗВЕРБ)
          </span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(
            [
              ["A", "А — освободени"],
              ["B", "Б — стандартна"],
              ["C", "В — горива"],
              ["D", "Г — намалена"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={`${label} (‰)`}>
              <input
                value={String(settings.vatRates[key])}
                onChange={(e) =>
                  set("vatRates", { [key]: parseInt(e.target.value, 10) || 0 })
                }
                className="input w-full text-center font-mono"
                inputMode="numeric"
              />
            </Field>
          ))}
        </div>
        <p className="text-xs text-ink-500">
          Ставките са в промили: 200 = 20%, 90 = 9%. По чл. 27 Н-18: А=0%, Б=20%, В=течни
          горива (20%), Г=9%.
        </p>
      </section>

      <LicenseSection />

      {/* Потребители */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Оператори</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Уникален код, две имена, роля с период на активност (Прил. № 29, т. 6). Одиторският профил вижда всичко, но не пише (т. 19).
            </p>
          </div>
          <button onClick={() => setUserModal("new")} className="btn-ghost text-sm shrink-0">
            <Plus size={16} /> Нов оператор
          </button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-800/60 last:border-0">
                <td className="py-2.5 font-mono text-ink-400 w-16">{String(u.operatorCode).padStart(4, "0")}</td>
                <td className="py-2.5 font-medium">{u.name}</td>
                <td className="py-2.5">
                  <Badge tone={u.readOnly ? "info" : u.role === "ADMIN" ? "warning" : u.role === "MANAGER" ? "info" : "neutral"}>
                    {roleName(u.role, u.readOnly)}
                  </Badge>
                  {(() => {
                    const g = u.roleGrants.find((x) => x.validTo === null);
                    return g ? (
                      <span className="block text-[11px] text-ink-500 mt-0.5">от {new Date(g.validFrom).toLocaleDateString("bg-BG")}</span>
                    ) : null;
                  })()}
                </td>
                <td className="py-2.5">
                  <Badge tone={u.active ? "success" : "danger"}>
                    {u.active ? "активен" : `спрян${u.deactivatedAt ? ` от ${new Date(u.deactivatedAt).toLocaleDateString("bg-BG")}` : ""}`}
                  </Badge>
                </td>
                <td className="py-2.5 text-right">
                  <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setUserModal(u)}>
                    Редакция
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <UserModal
        target={userModal}
        onClose={() => setUserModal(null)}
        onDone={() => {
          setUserModal(null);
          void load();
        }}
      />

      <Modal open={!!previewDoc} onClose={() => setPreviewDoc(null)} title={previewDoc?.title ?? ""}>
        <p className="text-xs text-ink-500 mb-3">
          Примерен документ с текущите данни — не е касов бон и не се печата на ФУ.
        </p>
        <pre className="bg-white text-[#17203a] rounded-2xl p-4 text-xs leading-tight font-mono overflow-x-auto shadow-inner whitespace-pre">
          {previewDoc?.text}
        </pre>
      </Modal>
    </div>
  );
}

function UserModal({
  target,
  onClose,
  onDone,
}: {
  target: User | "new" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    operatorCode: "",
    pin: "",
    role: "CASHIER" as keyof typeof ROLES,
    readOnly: false,
    active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target === "new") {
      setForm({ name: "", operatorCode: "", pin: "", role: "CASHIER", readOnly: false, active: true });
    } else if (target) {
      setForm({
        name: target.name,
        operatorCode: String(target.operatorCode),
        pin: "",
        role: target.role,
        readOnly: target.readOnly,
        active: target.active,
      });
    }
    setError(null);
  }, [target]);

  if (!target) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (target === "new") {
        await apiJson(
          await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name.trim(),
              operatorCode: parseInt(form.operatorCode, 10),
              pin: form.pin,
              role: form.role,
              readOnly: form.readOnly,
            }),
          })
        );
      } else if (target !== null) {
        await apiJson(
          await fetch("/api/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: (target as User).id,
              name: form.name.trim(),
              role: form.role,
              readOnly: form.readOnly,
              active: form.active,
              ...(form.pin ? { pin: form.pin } : {}),
            }),
          })
        );
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={target === "new" ? "Нов оператор" : "Редакция на оператор"}>
      <div className="space-y-4">
        <Field label="Име и фамилия (поне две имена)">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input w-full" />
        </Field>
        <Field label="Код на оператор (1–9999, влиза в УНП)">
          <input
            value={form.operatorCode}
            disabled={target !== "new"}
            onChange={(e) => setForm((f) => ({ ...f, operatorCode: e.target.value }))}
            className="input w-full disabled:opacity-50"
            inputMode="numeric"
          />
        </Field>
        <Field label={target === "new" ? "ПИН (4–8 цифри)" : "Нов ПИН (по избор)"}>
          <input
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
            className="input w-full"
            type="password"
            inputMode="numeric"
          />
        </Field>
        <Field label="Роля">
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as keyof typeof ROLES }))}
            className="input w-full"
          >
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={form.readOnly}
            onChange={(e) => setForm((f) => ({ ...f, readOnly: e.target.checked }))}
            className="size-5 accent-brand-500 mt-0.5"
          />
          <span>
            <span className="font-medium block">Одиторски профил — само четене</span>
            <span className="text-xs text-ink-500">За проверка от НАП (Прил. № 29, т. 19): вижда справките, дневника и настройките според ролята, но не може да променя нищо.</span>
          </span>
        </label>
        {target !== "new" && (
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="size-5 accent-brand-500"
            />
            <span className="font-medium">Активен</span>
          </label>
        )}
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full h-12">
          {busy ? "Записва се…" : "Запази"}
        </button>
      </div>
    </Modal>
  );
}

// Лиценз на касата — статус + активация с ключ от магазина (роля администратор).
function LicenseSection() {
  const [state, setState] = useState<{
    status: string;
    plan: string | null;
    seats: number | null;
    expiresAt: number | null;
    keyMasked: string | null;
  } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/license")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null));

  useEffect(() => {
    void load();
  }, []);

  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      await apiJson(
        await fetch("/api/license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: key.trim() }),
        })
      );
      setMsg({ ok: true, text: "Лицензът е активиран за тази каса." });
      setKey("");
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Грешка при активация." });
    } finally {
      setBusy(false);
    }
  }

  const PLAN_LABEL: Record<string, string> = {
    monthly: "месечен",
    yearly: "годишен",
    lifetime: "доживотен",
  };

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Лиценз</h2>
        {state && (
          <Badge tone={state.status === "active" ? "success" : state.status === "none" ? "warning" : "danger"}>
            {state.status === "active"
              ? `активен · ${PLAN_LABEL[state.plan ?? ""] ?? state.plan} · ${state.seats} каси`
              : state.status === "none"
                ? "неактивиран (демо)"
                : state.status === "expired"
                  ? "изтекъл"
                  : "невалиден"}
          </Badge>
        )}
      </div>
      {state?.status === "active" && state.expiresAt && (
        <p className="text-sm text-ink-500">
          Валиден до {new Date(state.expiresAt).toLocaleDateString("bg-BG")} (вкл. гратис период) ·{" "}
          {state.keyMasked}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="CSPOS-XXXXX-XXXXX-XXXXX-XXXXX"
          className="input flex-1 min-w-[16rem] font-mono"
        />
        <button onClick={activate} disabled={busy || key.trim().length < 10} className="btn-primary">
          {busy ? "Активира се…" : "Активирай"}
        </button>
      </div>
      {msg && (
        <p className={`text-sm font-medium ${msg.ok ? "text-mint-600" : "text-coral-600"}`}>{msg.text}</p>
      )}
      <p className="text-xs text-ink-500">
        Ключът се получава при покупка от магазина и важи за закупения брой каси. Активацията изисква
        еднократна интернет връзка; след това касата работи офлайн.
      </p>
    </section>
  );
}
