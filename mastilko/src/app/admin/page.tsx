"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Banner {
  id: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
  bg: string;
  fg: string;
  placement: "all" | "home";
  active: boolean;
  order: number;
}

function blank(): Banner {
  return {
    id: `b${Date.now()}${Math.round(performance.now())}`,
    title: "",
    text: "",
    cta: "",
    href: "",
    image: "",
    imageAlt: "",
    bg: "#DE9A32",
    fg: "#3A2E28",
    placement: "all",
    active: true,
    order: 0,
  };
}

export default function AdminBanners() {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/banners")
      .then((r) => (r.ok ? r.json() : { banners: [] }))
      .then((d) => setBanners(Array.isArray(d.banners) ? d.banners : []))
      .finally(() => setLoaded(true));
  }, []);

  function patch(id: string, p: Partial<Banner>) {
    setBanners((list) => list.map((b) => (b.id === id ? { ...b, ...p } : b)));
  }
  function remove(id: string) {
    setBanners((list) => list.filter((b) => b.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setBanners((list) => {
      const i = list.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners }),
      });
      if (!res.ok) throw new Error();
      setMsg("Запазено.");
    } catch {
      setMsg("Запазването не успя.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/vhod");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Рекламни банери</h1>
        <button type="button" onClick={logout} className="btn-secondary text-sm">
          Изход
        </button>
      </div>
      <p className="mt-2 text-ink-soft">
        Собствени съобщения и промоции. Показват се като лента на сайта — без
        чужди скриптове и без проследяване.
      </p>

      {!loaded ? (
        <p className="mt-8 text-ink-faint">Зареждане…</p>
      ) : (
        <div className="mt-6 space-y-4">
          {banners.map((b, i) => (
            <div key={b.id} className="card-warm space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div
                  className="rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ background: b.bg, color: b.fg }}
                >
                  {b.title || "Преглед"} {b.text && <span className="opacity-80">· {b.text}</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(b.id, -1)} disabled={i === 0} className="btn-secondary !px-2 !py-1 text-sm" aria-label="Нагоре">↑</button>
                  <button type="button" onClick={() => move(b.id, 1)} disabled={i === banners.length - 1} className="btn-secondary !px-2 !py-1 text-sm" aria-label="Надолу">↓</button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Заглавие</span>
                  <input className="field-input" maxLength={80} value={b.title} onChange={(e) => patch(b.id, { title: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Текст</span>
                  <input className="field-input" maxLength={200} value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Бутон (текст)</span>
                  <input className="field-input" maxLength={40} value={b.cta} onChange={(e) => patch(b.id, { cta: e.target.value })} placeholder="напр. Виж повече" />
                </label>
                <label className="block">
                  <span className="field-label">Линк (към къде води)</span>
                  <input className="field-input" maxLength={300} value={b.href} onChange={(e) => patch(b.id, { href: e.target.value })} placeholder="https://… или /gramoti" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="field-label">Изображение (по желание — пълноширок банер)</span>
                  <input className="field-input" maxLength={300} value={b.image} onChange={(e) => patch(b.id, { image: e.target.value })} placeholder="/banners/име.png (качи файла в public/banners/)" />
                </label>
                {b.image && (
                  <label className="block sm:col-span-2">
                    <span className="field-label">Описание на изображението (за достъпност)</span>
                    <input className="field-input" maxLength={120} value={b.imageAlt} onChange={(e) => patch(b.id, { imageAlt: e.target.value })} />
                  </label>
                )}
                <label className="block">
                  <span className="field-label">Фон</span>
                  <input type="color" className="h-10 w-full rounded-xl border border-ink/15" value={b.bg} onChange={(e) => patch(b.id, { bg: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Текст (цвят)</span>
                  <input type="color" className="h-10 w-full rounded-xl border border-ink/15" value={b.fg} onChange={(e) => patch(b.id, { fg: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Разположение</span>
                  <select className="field-input" value={b.placement} onChange={(e) => patch(b.id, { placement: e.target.value as Banner["placement"] })}>
                    <option value="all">Всички страници</option>
                    <option value="home">Само началната</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-ink-soft">
                  <input type="checkbox" checked={b.active} onChange={(e) => patch(b.id, { active: e.target.checked })} className="h-4 w-4 accent-tera" />
                  Активен (показва се)
                </label>
              </div>

              <button type="button" onClick={() => remove(b.id)} className="text-sm font-semibold text-tera-dark hover:underline">
                Изтрий банера
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setBanners((l) => [...l, blank()])} className="btn-secondary">
              + Нов банер
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Запазване…" : "Запази промените"}
            </button>
            {msg && <span aria-live="polite" className="text-sm font-semibold text-ink-soft">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
