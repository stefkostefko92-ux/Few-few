"use client";

// Ролята на влезлия потребител — за да НЕ показваме бутони, които сървърът
// ще откаже. Това е само удобство: правата се проверяват от сървъра на всяка
// заявка (`richiedeRuolo`). Едно четене на `/api/me` за целия раздел.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { isRuolo, type Ruolo } from "@/lib/roles";

let inVolo: Promise<Ruolo | null> | null = null;

function leggiRuolo(): Promise<Ruolo | null> {
  inVolo ??= apiFetch<{ ruolo?: string }>("/api/me").then((r) =>
    r.ok && isRuolo(r.dati.ruolo) ? r.dati.ruolo : null,
  );
  return inVolo;
}

export function useRuolo(): Ruolo | null {
  const [ruolo, setRuolo] = useState<Ruolo | null>(null);
  useEffect(() => {
    let vivo = true;
    void leggiRuolo().then((r) => vivo && setRuolo(r));
    return () => {
      vivo = false;
    };
  }, []);
  return ruolo;
}
