"use client";

// Настройки (само администратор): търговец, фискално устройство, ПОС терминал,
// двойно обозначаване, ДДС ставки, тегловни баркодове и потребители.

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Plus, Receipt, FileText } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { ROLES } from "@/lib/constants";

interface Settings {
  store: {
    name: string;
    eik: string;
    vatNumber: string;
    mol: string;
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
  fiscalDrivers: Array<{ id: string; label: string }>;
  terminalDrivers: Array<{ id: string; label: string }>;
}

interface User {
  id: string;
  name: string;
  operatorCode: number;
  role: keyof typeof ROLES;
  active: boolean;
}

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
    setUsers(us.users);
    setStatus(fs);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiJson(
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store: settings.store,
            fiscal: settings.fiscal,
            terminal: settings.terminal,
            display: settings.display,
            vatRates: settings.vatRates,
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
        <button onClick={save} disabled={busy} className="btn-primary">
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
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={settings.fiscal.suptoMode}
            onChange={(e) => set("fiscal", { suptoMode: e.target.checked })}
            className="size-5 accent-brand-500"
          />
          <span className="font-medium">
            СУПТО режим (доброволен) — печата УНП на бона и заключва изтриването
          </span>
        </label>
      </section>

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

      {/* Потребители */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Потребители</h2>
          <button onClick={() => setUserModal("new")} className="btn-ghost text-sm">
            <Plus size={16} /> Нов потребител
          </button>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-800/60 last:border-0">
                <td className="py-2.5 font-mono text-ink-400 w-16">{u.operatorCode}</td>
                <td className="py-2.5 font-medium">{u.name}</td>
                <td className="py-2.5">
                  <Badge tone={u.role === "ADMIN" ? "warning" : u.role === "MANAGER" ? "info" : "neutral"}>
                    {ROLES[u.role]}
                  </Badge>
                </td>
                <td className="py-2.5">
                  <Badge tone={u.active ? "success" : "danger"}>
                    {u.active ? "активен" : "спрян"}
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
          Примерен документ с текущите данни. Демонстрационен — не е реален фискален бон.
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
    active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target === "new") {
      setForm({ name: "", operatorCode: "", pin: "", role: "CASHIER", active: true });
    } else if (target) {
      setForm({
        name: target.name,
        operatorCode: String(target.operatorCode),
        pin: "",
        role: target.role,
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
    <Modal open onClose={onClose} title={target === "new" ? "Нов потребител" : "Редакция на потребител"}>
      <div className="space-y-4">
        <Field label="Име">
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
