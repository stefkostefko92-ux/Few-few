"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { visitNumber, formatVisitNumber } from "@/lib/visit-client";

// Номерът на посещението във футъра — вижда се при всяко зареждане, не само в
// началния екран (той е веднъж на сесия). Заявката е обща с началния екран;
// в административната част не броим (както и началният екран).
export function VisitCounter() {
  const isAdmin = usePathname()?.startsWith("/admin");
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (isAdmin) return;
    visitNumber().then(setN);
  }, [isAdmin]);

  // Редът е запазен и празен, докато дойде номерът — без скок в оформлението.
  return (
    <p className="min-h-[1.25rem] text-slate-600">
      {n !== null && !isAdmin && (
        <>
          Посещение №{" "}
          <span className="font-bold tabular-nums text-slate-800">{formatVisitNumber(n)}</span>{" "}
          на сайта
        </>
      )}
    </p>
  );
}
