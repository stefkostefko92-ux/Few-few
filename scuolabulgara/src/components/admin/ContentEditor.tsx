"use client";

import { useState } from "react";
import { LOCALE_META, LOCALES, type Locale } from "@/lib/i18n";
import MediaPicker from "./MediaPicker";

type Data = Record<Locale, Record<string, unknown>>;

const LABELS: Record<string, string> = {
  brandName: "Име", brandSub: "Подзаглавие", phone: "Телефон", phoneHref: "Телефон (връзка)",
  email: "Имейл", address: "Адрес", facebookUrl: "URL на Facebook", facebookPageHref: "Facebook страница (вграждане)",
  mapUrl: "URL на картата", badge: "Етикет", titleA: "Заглавие (начало)", titleAccent: "Заглавие (открояваща дума)",
  titleB: "Заглавие (край)", lead: "Въвеждащ текст", trust: "Ред за доверие", stat: "Число", statLabel: "Етикет на числото",
  eyebrow: "Надзаглавие", title: "Заглавие", body: "Текст", tag: "Етикет за място", features: "Характеристики",
  items: "Елементи", quote: "Цитат", quoteCite: "Автор на цитата", icon: "Икона", text: "Текст", bullets: "Точки от списък",
  num: "Число", label: "Етикет", scheduleTitle: "Заглавие на графика", schedule: "График", groupNote: "Бележка за групата",
  instructorName: "Име на преподавател", instructorRole: "Длъжност на преподавател", cta: "Бутон", points: "Точки",
  tiles: "Плочки", kind: "Тип", src: "Снимка", alt: "Алтернативен текст", big: "Голям текст", script: "Курсивен текст",
  small: "Подтекст", topics: "Теми", primary: "Основен бутон", secondary: "Втори бутон", day: "Ден",
  time: "Час", place: "Място",
};
const humanize = (k: string) => LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const isImageField = (k: string) => k === "src" || /image|photo|logo/i.test(k);
const isLongField = (k: string) => ["lead", "body", "text", "quote", "trust", "instructorRole", "groupNote"].includes(k);

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
function setByPath(root: any, path: (string | number)[], value: unknown) {
  const next = clone(root);
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return next;
}
function mutateArray(root: any, path: (string | number)[], fn: (arr: any[]) => void) {
  const next = clone(root);
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  fn(cur[path[path.length - 1]]);
  return next;
}

export default function ContentEditor({ contentKey, label, initial }: { contentKey: string; label: string; initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [locale, setLocale] = useState<Locale>("it");
  const [status, setStatus] = useState<{ msg: string; cls: string }>({ msg: "", cls: "" });
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | ((url: string) => void)>(null);

  const root = data[locale];
  const update = (path: (string | number)[], value: unknown) =>
    setData((d) => ({ ...d, [locale]: setByPath(d[locale], path, value) }));
  const arr = (path: (string | number)[], fn: (a: any[]) => void) =>
    setData((d) => ({ ...d, [locale]: mutateArray(d[locale], path, fn) }));

  async function save() {
    setSaving(true);
    setStatus({ msg: "", cls: "" });
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: contentKey, it: data.it, bg: data.bg, en: data.en }),
      });
      if (!res.ok) throw new Error();
      setStatus({ msg: "Запазено ✓", cls: "ok" });
    } catch {
      setStatus({ msg: "Грешка при запазване", cls: "err" });
    } finally {
      setSaving(false);
    }
  }

  function renderValue(value: unknown, path: (string | number)[], keyName: string): React.ReactNode {
    // string
    if (typeof value === "string") {
      if (isImageField(keyName)) {
        return (
          <div className="ad-field" key={path.join(".")}>
            <label>{humanize(keyName)}</label>
            <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
              {value && <img src={value} alt="" style={{ width: 60, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid var(--ad-line)" }} />}
              <input type="text" value={value} onChange={(e) => update(path, e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setPicker(() => (url: string) => { update(path, url); setPicker(null); })}>Избери</button>
            </div>
          </div>
        );
      }
      return (
        <div className="ad-field" key={path.join(".")}>
          <label>{humanize(keyName)}</label>
          {isLongField(keyName) || value.length > 70 ? (
            <textarea value={value} onChange={(e) => update(path, e.target.value)} />
          ) : (
            <input type="text" value={value} onChange={(e) => update(path, e.target.value)} />
          )}
        </div>
      );
    }

    // array
    if (Array.isArray(value)) {
      const isStrings = value.every((v) => typeof v === "string");
      return (
        <div className="ad-sub" key={path.join(".")}>
          <div className="ad-sub__head"><b>{humanize(keyName)}</b>
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => arr(path, (a) => a.push(isStrings ? "" : clone(a[a.length - 1] ?? {})))} disabled={!isStrings && value.length === 0}>+ Добави</button>
          </div>
          {value.map((item, i) => (
            <div className="ad-sub ad-list-item" key={i}>
              <div className="ad-sub__head">
                <b>#{i + 1}</b>
                <button type="button" className="ad-btn ad-btn--danger" onClick={() => arr(path, (a) => a.splice(i, 1))}>Премахни</button>
              </div>
              {isStrings
                ? renderValue(item, [...path, i], keyName.replace(/s$/, ""))
                : renderValue(item, [...path, i], keyName.replace(/s$/, ""))}
            </div>
          ))}
        </div>
      );
    }

    // object
    if (value && typeof value === "object") {
      return (
        <div key={path.join(".")} style={{ display: "grid", gap: ".2rem" }}>
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => renderValue(v, [...path, k], k))}
        </div>
      );
    }
    return null;
  }

  return (
    <>
      <div className="ad-tabs">
        {LOCALES.map((l) => (
          <button key={l} type="button" className={`ad-tab ${l === locale ? "active" : ""}`} onClick={() => setLocale(l)}>
            <span className="flag">{LOCALE_META[l].flag}</span>{LOCALE_META[l].label}
          </button>
        ))}
      </div>

      <div className="ad-panel">
        {Object.entries(root).map(([k, v]) => renderValue(v, [k], k))}
      </div>

      <div className="ad-save-bar">
        <button className="ad-btn ad-btn--primary" type="button" onClick={save} disabled={saving}>
          {saving ? "Запазване…" : "Запази промените"}
        </button>
        <span className={`status ${status.cls}`}>{status.msg}</span>
        <span style={{ marginLeft: "auto", color: "var(--ad-muted)", fontSize: ".85rem" }}>
          Редактирате: <b>{LOCALE_META[locale].label}</b> · трите езика се запазват заедно
        </span>
      </div>

      {picker && <MediaPicker onPick={picker} onClose={() => setPicker(null)} />}
    </>
  );
}
