"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

// Поле само за четене + бутон „Копирай“. Стойността е видима и маркируема
// дори без JavaScript или при отказан достъп до клипборда — копирането е
// удобство, не единственият път.
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [msg, setMsg] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMsg("Копирано.");
    } catch {
      setMsg("Не успях да копирам — маркирай адреса и го копирай ръчно.");
    }
  }

  return (
    <div>
      <label className="field-label" htmlFor="copy-field">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="copy-field"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="field-input font-mono text-sm"
        />
        <button type="button" onClick={copy} className="btn-primary shrink-0 justify-center">
          <Icon name="link" className="h-4 w-4" /> Копирай
        </button>
      </div>
      <p aria-live="polite" className="mt-1 min-h-5 text-sm text-ink-soft">
        {msg}
      </p>
    </div>
  );
}
