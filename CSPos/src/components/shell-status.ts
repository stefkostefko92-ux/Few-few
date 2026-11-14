"use client";

// Статусът на касата за горната лента и „За програмата“ — опреснява се на 30 s
// и веднага при връщане към прозореца (касиерът се връща от друг екран).

import { useCallback, useEffect, useState } from "react";

export interface ShellStatus {
  app: {
    name: string;
    version: string;
    manufacturer: { name: string; eik: string; vatNumber: string; address: string; email: string; web: string };
  };
  store: { name: string; eik: string; storeName: string; address: string; city: string };
  fiscal: { ok: boolean; detail: string; driver: string; serial: string; fiscalMemory: string };
  terminal: { ok: boolean; detail: string } | null;
  shift: { openedAt: string } | null;
  supto: { mode: boolean };
  license: { status: "none" | "active" | "expired" | "invalid"; plan: string | null; expiresAt: number | null };
}

export function useShellStatus(): { status: ShellStatus | null; offline: boolean; refresh: () => void } {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: ShellStatus) => {
        setStatus(j);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { status, offline, refresh };
}
