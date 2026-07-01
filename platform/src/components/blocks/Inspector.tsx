"use client";

import { useState } from "react";
import type { Block, Align } from "@/lib/blocks";
import { BLOCK_LABELS } from "@/lib/blocks";
import { ASSIST_ACTIONS, type AssistAction } from "@/lib/ai/assist-core";
import { UploadButton } from "@/components/blocks/UploadButton";

export type AssistFn = (
  action: AssistAction,
  text: string,
) => Promise<{ text?: string; error?: string }>;

// Редактор на свойствата на един блок. Промените се вдигат нагоре чрез onChange.
export function Inspector({
  block,
  onChange,
  assist,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
  assist?: AssistFn;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {BLOCK_LABELS[block.type]}
      </h3>

      {block.type === "heading" && (
        <>
          <Area label="Текст" value={block.text} onChange={(text) => onChange({ text })} />
          {assist && <AiTextTools assist={assist} value={block.text} onApply={(text) => onChange({ text })} />}
          <Select label="Ниво" value={String(block.level)} options={[["1", "H1 (голямо)"], ["2", "H2"], ["3", "H3"]]} onChange={(v) => onChange({ level: Number(v) as 1 | 2 | 3 })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "text" && (
        <>
          <Area label="Текст (markdown)" rows={6} value={block.text} onChange={(text) => onChange({ text })} />
          {assist && <AiTextTools assist={assist} value={block.text} onApply={(text) => onChange({ text })} />}
          <p className="text-[11px] text-ink-600">**удебелен** · _курсив_ · [връзка](https://…)</p>
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="Адрес на снимка (URL)" value={block.url} onChange={(url) => onChange({ url })} />
          <UploadButton onUploaded={(url) => onChange({ url })} />
          <Field label="Описание (alt)" value={block.alt} onChange={(alt) => onChange({ alt })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
          <Toggle label="Заоблени ъгли" checked={block.rounded} onChange={(rounded) => onChange({ rounded })} />
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Надпис" value={block.label} onChange={(label) => onChange({ label })} />
          <Field label="Връзка (URL)" value={block.href} onChange={(href) => onChange({ href })} />
          <Select label="Стил" value={block.variant} options={[["primary", "Основен"], ["ghost", "Контур"]]} onChange={(v) => onChange({ variant: v as "primary" | "ghost" })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "hero" && (
        <>
          <Field label="Заглавие" value={block.title} onChange={(title) => onChange({ title })} />
          {assist && <AiTextTools assist={assist} value={block.title} onApply={(title) => onChange({ title })} />}
          <Area label="Подзаглавие" value={block.subtitle} onChange={(subtitle) => onChange({ subtitle })} />
          {assist && <AiTextTools assist={assist} value={block.subtitle} onApply={(subtitle) => onChange({ subtitle })} />}
          <Field label="Надпис на бутон" value={block.buttonLabel} onChange={(buttonLabel) => onChange({ buttonLabel })} />
          <Field label="Връзка на бутон (URL)" value={block.buttonHref} onChange={(buttonHref) => onChange({ buttonHref })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "gallery" && (
        <GalleryEditor images={block.images} onChange={(images) => onChange({ images })} />
      )}

      {block.type === "columns" && (
        <>
          <Area label="Лява колона (markdown)" rows={5} value={block.left} onChange={(left) => onChange({ left })} />
          {assist && <AiTextTools assist={assist} value={block.left} onApply={(left) => onChange({ left })} />}
          <Area label="Дясна колона (markdown)" rows={5} value={block.right} onChange={(right) => onChange({ right })} />
          {assist && <AiTextTools assist={assist} value={block.right} onApply={(right) => onChange({ right })} />}
        </>
      )}

      {block.type === "video" && (
        <>
          <Field label="Адрес на видео (YouTube/Vimeo)" value={block.url} onChange={(url) => onChange({ url })} />
          <p className="text-[11px] text-ink-600">Поддържат се само YouTube и Vimeo връзки.</p>
        </>
      )}

      {block.type === "map" && (
        <>
          <Field label="Адрес за вграждане (OpenStreetMap)" value={block.url} onChange={(url) => onChange({ url })} />
          <p className="text-[11px] text-ink-600">
            В openstreetmap.org намерете мястото → „Споделяне“ → „HTML“ и копирайте адреса от полето (започва с https://www.openstreetmap.org/export/embed.html…).
          </p>
        </>
      )}

      {block.type === "form" && (
        <>
          <Field label="Заглавие" value={block.title} onChange={(title) => onChange({ title })} />
          <Field label="Надпис на бутон" value={block.buttonLabel} onChange={(buttonLabel) => onChange({ buttonLabel })} />
          <Area label="Съобщение при успех" value={block.successMessage} onChange={(successMessage) => onChange({ successMessage })} />
          <p className="text-[11px] text-ink-600">Заявките се събират в „Заявки“ на сайта.</p>
        </>
      )}

      {block.type === "faq" && (
        <ListEditor
          label="Въпроси"
          items={block.items}
          make={() => ({ q: "Нов въпрос?", a: "Отговор." })}
          onChange={(items) => onChange({ items })}
          fields={[["q", "Въпрос"], ["a", "Отговор"]]}
        />
      )}

      {block.type === "testimonials" && (
        <ListEditor
          label="Отзиви"
          items={block.items}
          make={() => ({ quote: "Отзив…", author: "Име", role: "" })}
          onChange={(items) => onChange({ items })}
          fields={[["quote", "Цитат"], ["author", "Автор"], ["role", "Роля"]]}
        />
      )}

      {block.type === "pricing" && (
        <PricingEditor plans={block.plans} onChange={(plans) => onChange({ plans })} />
      )}

      {block.type === "spacer" && (
        <Select label="Размер" value={block.size} options={[["sm", "Малко"], ["md", "Средно"], ["lg", "Голямо"]]} onChange={(v) => onChange({ size: v as "sm" | "md" | "lg" })} />
      )}

      {block.type === "divider" && (
        <p className="text-sm text-ink-500">Хоризонтална линия — няма настройки.</p>
      )}
    </div>
  );
}

// AI инструменти под текстово поле: подобри/скъси/официално/превод…
function AiTextTools({
  assist,
  value,
  onApply,
}: {
  assist: AssistFn;
  value: string;
  onApply: (text: string) => void;
}) {
  const [busy, setBusy] = useState<AssistAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: AssistAction) {
    if (busy || !value.trim()) return;
    setBusy(action);
    setError(null);
    try {
      const res = await assist(action, value);
      if (res.error) setError(res.error);
      else if (res.text) onApply(res.text);
    } catch {
      setError("Възникна грешка. Опитайте отново.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded border border-ink-800 bg-ink-950/50 p-2">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-ink-500">
        <span aria-hidden>🤖</span> AI асистент
      </div>
      <div className="flex flex-wrap gap-1">
        {ASSIST_ACTIONS.map((a) => (
          <button
            key={a.action}
            type="button"
            title={a.hint}
            disabled={!!busy || !value.trim()}
            onClick={() => run(a.action)}
            className="rounded border border-ink-700 px-2 py-1 text-[11px] text-ink-200 hover:border-brand-600 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy === a.action ? "…" : a.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-[11px] text-amber-400">{error}</p>}
    </div>
  );
}

// Общ редактор на списък от обекти с текстови полета (FAQ, отзиви).
function ListEditor<T extends Record<string, string>>({
  label,
  items,
  make,
  fields,
  onChange,
}: {
  label: string;
  items: T[];
  make: () => T;
  fields: [keyof T & string, string][];
  onChange: (items: T[]) => void;
}) {
  return (
    <div className="space-y-3">
      <span className="label">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="space-y-1 rounded border border-ink-800 p-2">
          {fields.map(([key, lbl]) => (
            <input
              key={key}
              className="input"
              placeholder={lbl}
              value={item[key]}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], [key]: e.target.value };
                onChange(next);
              }}
            />
          ))}
          <button
            className="btn-ghost w-full px-2 py-1 text-xs text-red-400"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            Премахни
          </button>
        </div>
      ))}
      <button className="btn-ghost w-full text-xs" onClick={() => onChange([...items, make()])}>
        + Добави
      </button>
    </div>
  );
}

type Plan = { name: string; price: string; period: string; features: string[]; href: string };

function PricingEditor({
  plans,
  onChange,
}: {
  plans: Plan[];
  onChange: (plans: Plan[]) => void;
}) {
  const patch = (i: number, changes: Partial<Plan>) => {
    const next = [...plans];
    next[i] = { ...next[i], ...changes };
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <span className="label">Планове</span>
      {plans.map((p, i) => (
        <div key={i} className="space-y-1 rounded border border-ink-800 p-2">
          <input className="input" placeholder="Име" value={p.name} onChange={(e) => patch(i, { name: e.target.value })} />
          <div className="flex gap-1">
            <input className="input" placeholder="Цена" value={p.price} onChange={(e) => patch(i, { price: e.target.value })} />
            <input className="input" placeholder="Период" value={p.period} onChange={(e) => patch(i, { period: e.target.value })} />
          </div>
          <textarea
            className="input"
            rows={3}
            placeholder="Функции (по една на ред)"
            value={p.features.join("\n")}
            onChange={(e) => patch(i, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <input className="input" placeholder="Връзка (URL)" value={p.href} onChange={(e) => patch(i, { href: e.target.value })} />
          <button className="btn-ghost w-full px-2 py-1 text-xs text-red-400" onClick={() => onChange(plans.filter((_, j) => j !== i))}>
            Премахни план
          </button>
        </div>
      ))}
      <button
        className="btn-ghost w-full text-xs"
        onClick={() => onChange([...plans, { name: "Нов план", price: "0 лв.", period: "/месец", features: [], href: "" }])}
      >
        + Добави план
      </button>
    </div>
  );
}

function GalleryEditor({
  images,
  onChange,
}: {
  images: { url: string; alt: string }[];
  onChange: (imgs: { url: string; alt: string }[]) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="label">Снимки</span>
      {images.map((img, i) => (
        <div key={i} className="space-y-1 rounded border border-ink-800 p-2">
          <div className="flex gap-1">
            <input
              className="input"
              placeholder="URL"
              value={img.url}
              onChange={(e) => {
                const next = [...images];
                next[i] = { ...next[i], url: e.target.value };
                onChange(next);
              }}
            />
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <input
            className="input"
            placeholder="Описание (alt)"
            value={img.alt}
            onChange={(e) => {
              const next = [...images];
              next[i] = { ...next[i], alt: e.target.value };
              onChange(next);
            }}
          />
          <UploadButton
            label="⬆ Качи в тази клетка"
            onUploaded={(url) => {
              const next = [...images];
              next[i] = { ...next[i], url };
              onChange(next);
            }}
          />
        </div>
      ))}
      <UploadButton
        label="⬆ Качи нова снимка"
        onUploaded={(url) => onChange([...images, { url, alt: "" }])}
      />
      <button
        className="btn-ghost w-full text-xs"
        onClick={() => onChange([...images, { url: "", alt: "" }])}
      >
        + Добави празна клетка
      </button>
    </div>
  );
}

// --- Полета ---

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function AlignField({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <Select
      label="Подравняване"
      value={value}
      options={[["left", "Ляво"], ["center", "Център"], ["right", "Дясно"]]}
      onChange={(v) => onChange(v as Align)}
    />
  );
}
