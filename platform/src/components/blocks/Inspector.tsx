"use client";

import type { Block, Align } from "@/lib/blocks";
import { BLOCK_LABELS } from "@/lib/blocks";

// Редактор на свойствата на един блок. Промените се вдигат нагоре чрез onChange.
export function Inspector({
  block,
  onChange,
}: {
  block: Block;
  onChange: (changes: Partial<Block>) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {BLOCK_LABELS[block.type]}
      </h3>

      {block.type === "heading" && (
        <>
          <Area label="Текст" value={block.text} onChange={(text) => onChange({ text })} />
          <Select label="Ниво" value={String(block.level)} options={[["1", "H1 (голямо)"], ["2", "H2"], ["3", "H3"]]} onChange={(v) => onChange({ level: Number(v) as 1 | 2 | 3 })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "text" && (
        <>
          <Area label="Текст (markdown)" rows={6} value={block.text} onChange={(text) => onChange({ text })} />
          <p className="text-[11px] text-ink-600">**удебелен** · _курсив_ · [връзка](https://…)</p>
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="Адрес на снимка (URL)" value={block.url} onChange={(url) => onChange({ url })} />
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
          <Area label="Подзаглавие" value={block.subtitle} onChange={(subtitle) => onChange({ subtitle })} />
          <Field label="Надпис на бутон" value={block.buttonLabel} onChange={(buttonLabel) => onChange({ buttonLabel })} />
          <Field label="Връзка на бутон (URL)" value={block.buttonHref} onChange={(buttonHref) => onChange({ buttonHref })} />
          <AlignField value={block.align} onChange={(align) => onChange({ align })} />
        </>
      )}

      {block.type === "gallery" && (
        <GalleryEditor images={block.images} onChange={(images) => onChange({ images })} />
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
        <div key={i} className="flex gap-1">
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
      ))}
      <button
        className="btn-ghost w-full text-xs"
        onClick={() => onChange([...images, { url: "", alt: "" }])}
      >
        + Добави снимка
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
