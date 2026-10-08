"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LOCALE_META, LOCALES, type Locale } from "@/lib/i18n";
import { BRAND_ICONS, NO_FALLBACK, altKeyFor, bundledAlt, isAudioKey, isBlankItem, isFileKey, isImageKey, isSharedKey } from "@/lib/cms";
import { previewUrl } from "@/lib/admin-preview";
import {
  addItem, fieldOf, getAt, moveItem, removeItem, setPerLocale, setValue, templatePath, type Data, type Doc, type Path,
} from "@/lib/editor-ops";
import { HINTS, ICON_LABELS, UI_GROUPS, humanize, isLongField } from "./editor-labels";
import MediaPicker from "./MediaPicker";

const fileName = (url: string) => decodeURIComponent(url.split("/").pop() || "");
const TAB_KEY = "qb-admin-locale";
const LANG_NAME: Record<Locale, string> = { it: "италиански", bg: "български", en: "английски" };

function Shared() {
  return <span className="qba-shared" title="Еднакво за трите езика — сменя се навсякъде наведнъж">🌐 общо за трите езика</span>;
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

  // The language tab you worked in last time opens again.
  useEffect(() => {
    try {
      const l = localStorage.getItem(TAB_KEY);
      if (l === "it" || l === "bg" || l === "en") setLocale(l);
    } catch {}
  }, []);
  const pickLocale = (l: Locale) => {
    setLocale(l);
    try { localStorage.setItem(TAB_KEY, l); } catch {}
  };

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
      setStatus({ msg: `Запазено ✓ — вече е на сайта. Текстът е на ${LANG_NAME[locale]}; другите езици показват своя текст.`, cls: "ok" });
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
        {HINTS[k] && <small className="qba-hint">{HINTS[k]}</small>}
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
      <div className="qba-field" key={path.join(".")}>
        {label(k, true)}
        <div className="qba-image">
          <div className="qba-image__thumb">{value ? <img src={value} alt="" /> : <span>Няма снимка</span>}</div>
          <div className="qba-image__meta">
            <b>{value ? fileName(value) : "—"}</b>
            <div className="qba-image__actions">
              <button type="button" className="qba-btn qba-btn--primary" onClick={() => setPicker(() => pick)}>
                {value ? "Смени снимката" : "Избери снимка"}
              </button>
              {canRestore && <button type="button" className="qba-btn qba-btn--ghost" onClick={() => pick(def as string)}>Върни стандартната</button>}
              {(k === "logo" || k === "shareImage") && value && <button type="button" className="qba-btn qba-btn--ghost" onClick={() => set(path, "")}>Махни</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function audioField(value: string, path: Path) {
    const key = path.join(".");
    const upload = async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      setStatus({ msg: "Качване на звука…", cls: "" });
      try {
        const res = await fetch("/api/admin/media", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.ok) throw new Error(String(res.status));
        set(path, json.media.url);
        setStatus({ msg: "Звукът е качен — натиснете „Запази промените“", cls: "" });
      } catch (e) {
        const code = String(e);
        setStatus({ msg: code.includes("415") ? "Това не е звуков файл (MP3, M4A, OGG или WAV)" : code.includes("413") ? "Файлът е над 3 MB" : "Качването не успя", cls: "err" });
      }
    };
    return (
      <div className="qba-field" key={key}>
        {label("audio", true)}
        <div className="qba-audio">
          {value ? <audio controls preload="none" src={value} /> : <span className="qba-muted">Няма звук</span>}
          <label className="qba-btn qba-btn--primary" style={{ cursor: "pointer" }}>
            {value ? "Смени звука" : "Качи звук"}
            <input type="file" hidden accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/wav,.mp3,.m4a,.ogg,.wav" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
          {value && <button type="button" className="qba-btn qba-btn--ghost" onClick={() => set(path, "")}>Махни</button>}
        </div>
      </div>
    );
  }

  function fileField(value: string, path: Path) {
    const key = path.join(".");
    const upload = async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      setStatus({ msg: "Качване на документа…", cls: "" });
      try {
        const res = await fetch("/api/admin/media", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.ok) throw new Error(String(res.status));
        set(path, json.media.url);
        setStatus({ msg: "Документът е качен — натиснете „Запази промените“", cls: "" });
      } catch (e) {
        const code = String(e);
        setStatus({ msg: code.includes("415") ? "Това не е PDF файл" : code.includes("413") ? "Файлът е над 14 MB" : "Качването не успя", cls: "err" });
      }
    };
    const external = /^https?:\/\//i.test(value);
    return (
      <div className="qba-field" key={key}>
        {label("file", true)}
        <div className="qba-file">
          {value ? <a href={value} target="_blank" rel="noopener noreferrer">{fileName(value)}</a> : <span className="qba-muted">Няма файл</span>}
          {external && <small className="qba-hint">⚠ Файлът още е на стария сайт — качете го тук, за да остане и след като старият сайт спре.</small>}
          <label className="qba-btn qba-btn--primary" style={{ cursor: "pointer" }}>
            {value ? "Смени PDF" : "Качи PDF"}
            <input type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
          {value && <button type="button" className="qba-btn qba-btn--ghost" onClick={() => set(path, "")}>Махни</button>}
        </div>
      </div>
    );
  }

  function iconField(value: string, path: Path) {
    return (
      <div className="qba-field" key={path.join(".")}>
        {label("icon", true)}
        <div className="qba-icons" role="radiogroup" aria-label="Икона">
          {BRAND_ICONS.map((name) => (
            <button
              type="button" key={name} role="radio" aria-checked={value === name}
              className={`qba-icon ${value === name ? "active" : ""}`} onClick={() => set(path, name)} title={ICON_LABELS[name]}
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
      <div className={`qba-field ${missingAlt ? "qba-field--warn" : ""}`} key={path.join(".")}>
        {label(k, shared)}
        {missingAlt && <p className="qba-warn" role="note">⚠ Липсва описание на този език — добавете какво има на снимката.</p>}
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
      <div className="qba-sub" key={path.join(".")}>
        <div className="qba-sub__head">
          <b>{humanize(k)} <span className="qba-count">{value.length}</span></b>
          <button type="button" className="qba-btn qba-btn--ghost" onClick={() => change((d) => addItem(d, path, tpl))}>+ Добави</button>
        </div>
        {value.length === 0 && <p className="qba-empty-list">Празно. Натиснете „+ Добави“.</p>}
        {value.map((item, i) => (
          <div className="qba-sub qba-list-item" key={i}>
            <div className="qba-sub__head">
              <b>#{i + 1}</b>
              <div className="qba-item-actions">
                <button type="button" className="qba-btn qba-btn--ghost qba-btn--icon" disabled={i === 0} onClick={() => change((d) => moveItem(d, path, i, -1))} aria-label="Нагоре" title="Нагоре">↑</button>
                <button type="button" className="qba-btn qba-btn--ghost qba-btn--icon" disabled={i === value.length - 1} onClick={() => change((d) => moveItem(d, path, i, 1))} aria-label="Надолу" title="Надолу">↓</button>
                <button type="button" className="qba-btn qba-btn--danger" onClick={() => { if (confirm("Да премахна ли този елемент от трите езика?")) change((d) => removeItem(d, path, i)); }}>Премахни</button>
              </div>
            </div>
            {translationNote([...path, i])}
            {renderValue(item, [...path, i], k)}
          </div>
        ))}
      </div>
    );
  }

  // A list item written in one language only: say where it is missing and
  // what the site shows there meanwhile (the text of the language it has).
  function translationNote(path: Path) {
    if (NO_FALLBACK.has(contentKey)) return null;
    const blank = (l: Locale) => isBlankItem(getAt(data[l], path));
    const missing = LOCALES.filter((l) => l !== locale && blank(l));
    if (blank(locale)) {
      const from = (["it", "bg", "en"] as const).find((l) => !blank(l));
      return from ? <p className="qba-warn" role="note">⚠ На {LANG_NAME[locale]} още няма текст — на сайта тук засега се показва текстът на {LANG_NAME[from]}.</p> : null;
    }
    return missing.length ? (
      <p className="qba-note" role="note">Още без превод на {missing.map((l) => LANG_NAME[l]).join(" и ")} — там засега се показва този текст.</p>
    ) : null;
  }

  function renderValue(value: unknown, path: Path, k: string): ReactNode {
    if (typeof value === "string") {
      if (k === "icon") return iconField(value, path);
      if (isImageKey(k)) return imageField(value, path, k);
      if (isAudioKey(k)) return audioField(value, path);
      if (isFileKey(k)) return fileField(value, path);
      return textField(value, path, k);
    }
    if (Array.isArray(value)) return listField(value, path, k);
    if (value && typeof value === "object") {
      return (
        <div key={path.join(".")} className="qba-group">
          {Object.entries(value as Doc).map(([ck, v]) => renderValue(v, [...path, ck], ck))}
        </div>
      );
    }
    return null;
  }

  // The interface wording is a flat list of ~40 strings: grouped, it reads.
  function renderUi(root: Doc) {
    return UI_GROUPS.map((g) => (
      <fieldset className="qba-fieldset" key={g.title}>
        <legend>{g.title}</legend>
        {Object.entries(g.keys).map(([key, label]) =>
          typeof root[key] === "string" ? (
            <div className="qba-field" key={key}>
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
      <div className="qba-tabs" role="tablist">
        {LOCALES.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === locale} className={`qba-tab ${l === locale ? "active" : ""}`} onClick={() => pickLocale(l)}>
            <span className="flag">{LOCALE_META[l].flag}</span>{LOCALE_META[l].label}
          </button>
        ))}
      </div>

      <div className="qba-panel">
        {contentKey === "ui" ? renderUi(root) : Object.entries(root).map(([k, v]) => renderValue(v, [k], k))}
      </div>

      <div className="qba-save-bar">
        <button className="qba-btn qba-btn--primary" type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? "Запазване…" : dirty ? "Запази промените" : "Няма промени"}
        </button>
        <span className={`status ${status.cls}`} role="status" aria-live="polite">{status.msg}</span>
        <span className="qba-save-bar__note">
          Редактирате: <b>{LOCALE_META[locale].label}</b> · текстът е за всеки език поотделно, снимките и подредбата — общи ·
          виж на сайта:{" "}
          {LOCALES.map((l, i) => (
            <span key={l}>{i > 0 && " · "}<a href={previewUrl(contentKey, l)} target="_blank" rel="noopener">{l.toUpperCase()}</a></span>
          ))}
        </span>
      </div>

      {picker && <MediaPicker onPick={picker} onClose={() => setPicker(null)} />}
    </>
  );
}
