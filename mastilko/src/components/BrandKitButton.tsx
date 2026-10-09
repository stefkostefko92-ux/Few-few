"use client";

import { useState } from "react";
import { readBrandKit } from "@/lib/brand-kit";
import type { StyleState } from "@/lib/style";
import Icon from "@/components/Icon";

// Бутон „Приложи стила от визитката“ — копира темата/цветовете/шрифта и
// останалите стилови настройки от запазената визитка към текущия документ.
export default function BrandKitButton({
  onApply,
}: {
  onApply: (patch: Partial<StyleState>) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn-secondary text-sm"
        onClick={() => {
          const kit = readBrandKit("mastilko-cards");
          if (kit) {
            onApply(kit);
            setMsg("Приложих стила от визитката ти.");
          } else {
            setMsg("Първо направи визитка, за да копираш стила ѝ.");
          }
        }}
      >
        <Icon name="palette" className="h-4 w-4" /> Приложи стила от визитката
      </button>
      {msg && <p className="mt-1 text-xs text-ink-faint">{msg}</p>}
    </div>
  );
}
