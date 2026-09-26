"use client";

// Лентата „MASTER работи във фирма X". Без нея лесно се забравя, че се пише в
// данните на ТАЗИ фирма от групата — а всеки запис оттук носи номерацията, одита и
// обхвата на ТАЗИ фирма. Видима на всяка страница, с изход с едно натискане.

import { useEffect, useState } from "react";
import { IcoAttenzione } from "@/components/icone";
import { apiFetch } from "@/lib/fetch-client";

interface Contesto {
  id: string;
  ragioneSociale: string;
}

export default function BannerContesto() {
  const [azienda, setAzienda] = useState<Contesto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    void apiFetch<{ aziendaContesto?: Contesto | null }>("/api/me").then(
      (r) => r.ok && setAzienda(r.dati.aziendaContesto ?? null),
    );
  }, []);

  if (!azienda) return null;

  async function esci() {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    // Презареждането при неуспех би оставило лентата — и човека в мнението,
    // че вече е излязъл, докато още пише в данните на тази фирма.
    const r = await apiFetch<{ error?: string }>(
      "/api/amministrazione/azienda",
      { method: "POST", body: JSON.stringify({ tenantId: null }) },
    );
    if (r.ok) {
      window.location.reload();
      return;
    }
    setErrore(r.dati.error ?? "Uscita non riuscita: riprovare.");
    setInCorso(false);
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
      {errore && (
        <span role="alert" className="text-danger-text">
          {errore}
        </span>
      )}
      <button
        type="button"
        className="btn-secondary h-7 px-2 text-xs"
        onClick={() => void esci()}
        disabled={inCorso}
      >
        Esci dall&apos;azienda
      </button>
    </div>
  );
}
