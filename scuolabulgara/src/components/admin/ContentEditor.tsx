"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LOCALE_META, LOCALES, type Locale } from "@/lib/i18n";
import { BRAND_ICONS, altKeyFor, bundledAlt, isImageKey, isSharedKey } from "@/lib/cms";
import {
  addItem, fieldOf, getAt, moveItem, removeItem, setPerLocale, setValue, templatePath, type Data, type Doc, type Path,
} from "@/lib/editor-ops";
import { HINTS, ICON_LABELS, UI_GROUPS, humanize, isLongField } from "./editor-labels";
import MediaPicker from "./MediaPicker";

const fileName = (url: string) => decodeURIComponent(url.split("/").pop() || "");

function Shared() {
  return <span className="ad-shared" title="Еднакво за трите езика — сменя се навсякъде наведнъж">🌐 общо за трите езика</span>;
}

export default function ContentEditor({ contentKey, initial, template }: {
  contentKey: string;
  initial: Data;
  /** Bundled defaults (one language) — the shape used to refill an emptied list. */
  template: Doc;
}) {
  const [data, setData] = useState<Data>(initial);
  const [locale, setLocale] = useState<Locale>("it");
  const [status, setStatus] = useState<{ msg: string; cls: string }>({ msg: "", cls: "" });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<null | ((url: string) => void)>(null);

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: (d: Data) => Data) => { setData(next); setDirty(true); setStatus({ msg: "", cls: "" }); };
  const set = (path: Path, value: unknown) => change((d) => setValue(d, locale, path, value));

  async function save() {
    setSaving(true);
    setStatus({ msg: "", cls: "" });
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: contentKey, it: data.it, bg: data.bg, en: data.en }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDirty(false);
      setStatus({ msg: "Запазено ✓ — вече е на сайта", cls: "ok" });
    } catch (e) {
      setStatus({ msg: String(e).includes("413") ? "Твърде много съдържание за една секция" : "Грешка при запазване — опитайте отново", cls: "err" });
    } finally {
      setSaving(false);
    }
  }

  // ---- field renderers ------------------------------------------------------
  // A plain function, not a nested component: a component declared inside the
  // editor would be re-created (and re-mounted) on every keystroke.
  function label(k: string, shared: boolean) {
    return (
      <label>
        {humanize(k)} {shared && <Shared />}
        {HINTS[k] && <small className="ad-hint">{HINTS[k]}</small>}
      </label>
    );
  }

  function imageField(value: string, path: Path, k: string) {
    // A new photo brings its own description: the bundled ones are known in all
    // three languages; for an upload the old text is cleared (and flagged below)
    // rather than left describing the previous picture.
    const pick = (url: string) => {
      change((d) => {
        let next = setValue(d, locale, path, url);
        const altKey = altKeyFor(k);
        if (altKey) {
          const altPath = [...path.slice(0, -1), altKey];
          next = setPerLocale(next, altPath, bundledAlt(url) ?? { it: "", bg: "", en: "" });
        }
        return next;
      });
      setPicker(null);
    };
    const def = getAt(template, templatePath(path));
    const canRestore = k === "image" && typeof def === "string" && def !== value;
    return (
      <div className="ad-field" key={path.join(".")}>
        {label(k, true)}
        <div className="ad-image">
          <div className="ad-image__thumb">{value ? <img src={value} alt="" /> : <span>Няма снимка</span>}</div>
          <div className="ad-image__meta">
            <b>{value ? fileName(value) : "—"}</b>
            <div className="ad-image__actions">
              <button type="button" className="ad-btn ad-btn--primary" onClick={() => setPicker(() => pick)}>
                {value ? "Смени снимката" : "Избери снимка"}
              </button>
              {canRestore && <button type="button" className="ad-btn ad-btn--ghost" onClick={() => pick(def as string)}>Върни стандартната</button>}
              {(k === "logo" || k === "shareImage") && value && <button type="button" className="ad-btn ad-btn--ghost" onClick={() => set(path, "")}>Махни</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function iconField(value: string, path: Path) {
    return (
      <div className="ad-field" key={path.join(".")}>
        {label("icon", true)}
        <div className="ad-icons" role="radiogroup" aria-label="Икона">
          {BRAND_ICONS.map((name) => (
            <button
              type="button" key={name} role="radio" aria-checked={value === name}
              className={`ad-icon ${value === name ? "active" : ""}`} onClick={() => set(path, name)} title={ICON_LABELS[name]}
            >
              <img src={`/assets/img/icons/${name}.webp`} alt="" />
              <span>{ICON_LABELS[name]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function textField(value: string, path: Path, k: string) {
    const shared = isSharedKey(fieldOf(path));
    const long = isLongField(k, value);
    // A photo with no description in this language is invisible to screen readers.
    const imgKey = k === "imageAlt" ? "image" : k === "alt" ? "src" : "";
    const img = imgKey ? getAt(data[locale], [...path.slice(0, -1), imgKey]) : undefined;
    const missingAlt = typeof img === "string" && img !== "" && !value.trim();
    return (
      <div className={`ad-field ${missingAlt ? "ad-field--warn" : ""}`} key={path.join(".")}>
        {label(k, shared)}
        {missingAlt && <p className="ad-warn" role="note">⚠ Липсва описание на този език — добавете какво има на снимката.</p>}
        {long ? (
          <textarea value={value} onChange={(e) => set(path, e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(value.length / 80)))} />
        ) : (
          <input type="text" value={value} onChange={(e) => set(path, e.target.value)} />
        )}
      </div>
    );
  }

  function listField(value: unknown[], path: Path, k: string) {
    const tpl = getAt(template, templatePath([...path, 0]));
    return (
      <div className="ad-sub" key={path.join(".")}>
        <div className="ad-sub__head">
          <b>{humanize(k)} <span className="ad-count">{value.length}</span></b>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={() => change((d) => addItem(d, path, tpl))}>+ Добави</button>
        </div>
        {value.length === 0 && <p className="ad-empty-list">Празно. Натиснете „+ Добави“.</p>}
        {value.map((item, i) => (
          <div className="ad-sub ad-list-item" key={i}>
            <div className="ad-sub__head">
              <b>#{i + 1}</b>
              <div className="ad-item-actions">
                <button type="button" className="ad-btn ad-btn--ghost ad-btn--icon" disabled={i === 0} onClick={() => change((d) => moveItem(d, path, i, -1))} aria-label="Нагоре" title="Нагоре">↑</button>
                <button type="button" className="ad-btn ad-btn--ghost ad-btn--icon" disabled={i === value.length - 1} onClick={() => change((d) => moveItem(d, path, i, 1))} aria-label="Надолу" title="Надолу">↓</button>
                <button type="button" className="ad-btn ad-btn--danger" onClick={() => { if (confirm("Да премахна ли този елемент от трите езика?")) change((d) => removeItem(d, path, i)); }}>Премахни</button>
              </div>
            </div>
            {renderValue(item, [...path, i], k)}
          </div>
        ))}
      </div>
    );
  }

  function renderValue(value: unknown, path: Path, k: string): ReactNode {
    if (typeof value === "string") {
      if (k === "icon") return iconField(value, path);
      if (isImageKey(k)) return imageField(value, path, k);
      return textField(value, path, k);
    }
    if (Array.isArray(value)) return listField(value, path, k);
    if (value && typeof value === "object") {
      return (
        <div key={path.join(".")} className="ad-group">
          {Object.entries(value as Doc).map(([ck, v]) => renderValue(v, [...path, ck], ck))}
        </div>
      );
    }
    return null;
  }

  // The interface wording is a flat list of ~40 strings: grouped, it reads.
  function renderUi(root: Doc) {
    return UI_GROUPS.map((g) => (
      <fieldset className="ad-fieldset" key={g.title}>
        <legend>{g.title}</legend>
        {Object.entries(g.keys).map(([key, label]) =>
          typeof root[key] === "string" ? (
            <div className="ad-field" key={key}>
              <label>{label}</label>
              {isLongField(key, root[key] as string) ? (
                <textarea value={root[key] as string} onChange={(e) => set([key], e.target.value)} rows={3} />
              ) : (
                <input type="text" value={root[key] as string} onChange={(e) => set([key], e.target.value)} />
              )}
            </div>
          ) : null,
        )}
      </fieldset>
    ));
  }

  const root = data[locale];
  return (
    <>
      <div className="ad-tabs" role="tablist">
        {LOCALES.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === locale} className={`ad-tab ${l === locale ? "active" : ""}`} onClick={() => setLocale(l)}>
            <span className="flag">{LOCALE_META[l].flag}</span>{LOCALE_META[l].label}
          </button>
        ))}
      </div>

      <div className="ad-panel">
        {contentKey === "ui" ? renderUi(root) : Object.entries(root).map(([k, v]) => renderValue(v, [k], k))}
      </div>

      <div className="ad-save-bar">
        <button className="ad-btn ad-btn--primary" type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? "Запазване…" : dirty ? "Запази промените" : "Няма промени"}
        </button>
        <span className={`status ${status.cls}`} role="status" aria-live="polite">{status.msg}</span>
        <span className="ad-save-bar__note">
          Редактирате: <b>{LOCALE_META[locale].label}</b> · текстът е за всеки език поотделно, снимките и подредбата — общи
        </span>
      </div>

      {picker && <MediaPicker onPick={picker} onClose={() => setPicker(null)} />}
    </>
  );
}
