"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { mapVizitkaToCard, vizitkaApiUrl } from "@/lib/vizitka-import";

// Ключът, под който CardStudio пази състоянието си (useLocalState).
const CARD_KEY = "mastilko-cards";

// Внасяне на визитка от Визитка: чете токена от URL-а, тегли публичните данни
// от API-то, напълва редактора (localStorage) и препраща към /vizitki.
export default function VizitkaImport() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(vizitkaApiUrl(token), { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const patch = mapVizitkaToCard(await res.json());

        let existing: Record<string, unknown> = {};
        try {
          existing = JSON.parse(localStorage.getItem(CARD_KEY) || "{}");
        } catch {
          existing = {};
        }
        localStorage.setItem(CARD_KEY, JSON.stringify({ ...existing, ...patch }));

        if (!cancelled) router.replace("/vizitki");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (status === "error") {
    return (
      <div className="card-warm space-y-4 p-6">
        <h1 className="font-display text-2xl font-bold">Внасянето не успя</h1>
        <p className="text-ink-soft">
          Връзката е изтекла или е невалидна. Върни се във Визитка и опитай пак от бутона
          „Разпечатай визитки“. Токенът важи 30 минути.
        </p>
        <Link href="/vizitki" className="btn-primary">
          Направи визитка от начало →
        </Link>
      </div>
    );
  }

  return (
    <div className="card-warm space-y-3 p-6" aria-live="polite">
      <div
        className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-tera border-t-transparent"
        aria-hidden="true"
      />
      <h1 className="font-display text-2xl font-bold">Внасяме визитката ти…</h1>
      <p className="text-ink-soft">
        Пренасяме данните от Визитка и подготвяме визитката за печат. Ще те насочим до
        редактора след миг.
      </p>
    </div>
  );
}
