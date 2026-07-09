"use client";

import { useState } from "react";

export default function EnableToggle({ contentKey, enabled }: { contentKey: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !on;
    const res = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: contentKey, enabled: next }),
    });
    if (res.ok) setOn(next);
    setBusy(false);
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} className={`ad-badge ${on ? "on" : "off"}`} style={{ border: 0, cursor: "pointer" }} title="Покажи/Скрий в сайта">
      {on ? "Видима" : "Скрита"}
    </button>
  );
}
