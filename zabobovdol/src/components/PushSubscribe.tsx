"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/events";

type Topic = { key: string; label: string; hint: string };

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Известия: нищо не е отметнато предварително и разрешение се иска САМО след
// натискане на бутона „Включете известията“.
export function PushSubscribe({ topics }: { topics: Topic[] }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setActive(!!s))
      .catch(() => {});
  }, []);

  const toggle = (k: string) =>
    setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  async function enable() {
    setMsg("");
    if (chosen.length === 0) {
      setMsg("Изберете поне една тема.");
      return;
    }
    setBusy(true);
    try {
      const keyRes = await fetch("/api/push/key", { cache: "no-store" });
      if (!keyRes.ok) throw new Error("Известията още не са включени от сайта.");
      const { key } = (await keyRes.json()) as { key: string };
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Не сте разрешили известията. Можете да го направите от настройките на телефона.");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), topics: chosen }),
      });
      if (!res.ok) throw new Error("Не успяхме да запишем избора ви. Опитайте пак.");
      track("push_subscribe");
      setActive(true);
      setMsg("Готово. Ще ви известяваме само за избраното.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Нещо се обърка. Опитайте пак.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      track("push_unsubscribe");
      setActive(false);
      setMsg("Отписахте се. Повече няма да получавате известия.");
    } catch {
      setMsg("Не успяхме да ви отпишем. Опитайте пак.");
    } finally {
      setBusy(false);
    }
  }

  if (supported === false) {
    return (
      <p className="panel">
        Този телефон или браузър не поддържа известия. Можете да следите новините през Viber канала или RSS (по-долу).
      </p>
    );
  }

  return (
    <div className="form-panel">
      {active ? (
        <>
          <p className="font-semibold">Известията са включени на това устройство.</p>
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={disable} disabled={busy}>
            Спрете известията
          </button>
        </>
      ) : (
        <>
          <fieldset className="space-y-3">
            <legend className="legend px-0">За какво искате известия?</legend>
            {topics.map((t) => (
              <label key={t.key} className="flex min-h-[44px] items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-6 w-6 shrink-0"
                  checked={chosen.includes(t.key)}
                  onChange={() => toggle(t.key)}
                />
                <span>
                  <span className="block font-semibold text-slate-900">{t.label}</span>
                  <span className="block text-base text-slate-600">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={enable} disabled={busy || supported === null}>
            Включете известията
          </button>
        </>
      )}
      <p role="status" aria-live="polite" className={`text-base text-slate-800 ${msg ? "" : "!mt-0"}`}>
        {msg}
      </p>
    </div>
  );
}
