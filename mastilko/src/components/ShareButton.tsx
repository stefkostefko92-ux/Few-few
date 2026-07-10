"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { encodeState } from "@/lib/share";

// Копира линк, който съдържа целия дизайн (кодиран в URL) — пращаш го на
// колега и той вижда точно твоя проект. Без сървър, без съхранение.
export default function ShareButton({ state }: { state: object }) {
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}#p=${encodeState(state)}`;
    if (url.length > 12000) {
      setMsg("Дизайнът е твърде голям за линк (заради качено изображение). Ползвай „Свали проекта“.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Линкът е копиран.");
    } catch {
      setMsg(url);
    }
  }

  return (
    <div className="no-print">
      <button type="button" onClick={share} className="btn-secondary text-sm">
        <Icon name="link" className="h-4 w-4" /> Копирай линк за споделяне
      </button>
      {msg && (
        <p aria-live="polite" className="mt-1 break-all text-xs text-ink-soft">
          {msg}
        </p>
      )}
    </div>
  );
}
