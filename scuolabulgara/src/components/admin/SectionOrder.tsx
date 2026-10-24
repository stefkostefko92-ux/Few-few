"use client";

import { useState } from "react";
import Link from "next/link";
import EnableToggle from "./EnableToggle";

type Item = { key: string; label: string; enabled: boolean; preview: string };

// The page's sections in their on-page order. Arrows move a section; the new
// order is saved in one request (one transaction on the server).
export default function SectionOrder({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; cls: string }>({ msg: "", cls: "" });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setDirty(true);
    setStatus({ msg: "", cls: "" });
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: items.map((x) => x.key) }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
      setStatus({ msg: "Подредбата е запазена ✓", cls: "ok" });
    } catch {
      setStatus({ msg: "Грешка при запазване", cls: "err" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ol className="qba-order">
        {items.map((s, i) => (
          <li className="qba-order__item" key={s.key}>
            <span className="qba-order__num" aria-hidden="true">{i + 1}</span>
            <div className="qba-order__name">
              <b>{s.label}</b>
            </div>
            <div className="qba-order__actions">
              <button type="button" className="qba-btn qba-btn--ghost qba-btn--icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${s.label} — нагоре`} title="Нагоре">↑</button>
              <button type="button" className="qba-btn qba-btn--ghost qba-btn--icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`${s.label} — надолу`} title="Надолу">↓</button>
              <EnableToggle contentKey={s.key} enabled={s.enabled} />
              <a className="qba-btn qba-btn--ghost" href={s.preview} target="_blank" rel="noopener">Преглед</a>
              <Link className="qba-btn qba-btn--primary" href={`/admin/content/${s.key}`}>Редактирай</Link>
            </div>
          </li>
        ))}
      </ol>
      <div className="qba-save-bar qba-save-bar--inline">
        <button type="button" className="qba-btn qba-btn--primary" onClick={save} disabled={!dirty || saving}>
          {saving ? "Запазване…" : dirty ? "Запази подредбата" : "Подредбата е запазена"}
        </button>
        <span className={`status ${status.cls}`} role="status" aria-live="polite">{status.msg}</span>
      </div>
    </>
  );
}
