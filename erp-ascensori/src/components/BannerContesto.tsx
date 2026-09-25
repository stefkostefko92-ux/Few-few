"use client";

// Лентата „MASTER работи във фирма X". Без нея лесно се забравя, че се пише в
// данните на ТАЗИ фирма от групата — а всеки запис оттук носи номерацията, одита и
// обхвата на ТАЗИ фирма. Видима на всяка страница, с изход с едно натискане.

import { useEffect, useState } from "react";
import { IcoAttenzione } from "@/components/icone";

interface Contesto {
  id: string;
  ragioneSociale: string;
}

export default function BannerContesto() {
  const [azienda, setAzienda] = useState<Contesto | null>(null);

  useEffect(() => {
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAzienda(d?.aziendaContesto ?? null))
      .catch(() => null);
  }, []);

  if (!azienda) return null;

  async function esci() {
    await fetch("/api/amministrazione/azienda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: null }),
    });
    window.location.reload();
  }

  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-text"
      role="status"
      data-testid="banner-contesto"
    >
      <span className="flex items-center gap-2">
        <IcoAttenzione />
        <span>
          Stai operando nell&apos;azienda{" "}
          <strong>{azienda.ragioneSociale}</strong>: i dati inseriti
          appartengono a questa azienda.
        </span>
      </span>
      <button
        type="button"
        className="btn-secondary h-7 px-2 text-xs"
        onClick={() => void esci()}
      >
        Esci dall&apos;azienda
      </button>
    </div>
  );
}
