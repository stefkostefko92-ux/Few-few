"use client";

import { DECORS, type StyleState } from "@/lib/style";
import ThemePicker from "@/components/ThemePicker";
import FontPicker from "@/components/FontPicker";
import Icon from "@/components/Icon";

interface Props {
  value: StyleState;
  onChange: (patch: Partial<StyleState>) => void;
  /** Скрий избора на шрифт. */
  hideFont?: boolean;
  /** Скрий украсата на фона (напр. за документи като CV). */
  hideDecor?: boolean;
}

// Общ панел за персонализация: тема или свои цветове + шрифт + украса на фона.
// Ползва се от всички редактори, за да е поведението еднакво навсякъде.
export default function StyleControls({ value, onChange, hideFont, hideDecor }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <span className="field-label">Цветова тема</span>
        <ThemePicker
          value={value.themeId}
          onChange={(id) => onChange({ themeId: id, customColors: false })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <input
          type="checkbox"
          checked={!!value.customColors}
          onChange={(e) => onChange({ customColors: e.target.checked })}
          className="h-4 w-4 accent-tera"
        />
        <Icon name="palette" className="h-4 w-4" /> Свои цветове
      </label>

      {value.customColors && (
        <div className="grid grid-cols-3 gap-2">
          {([
            ["cbg", "Фон"],
            ["cfg", "Текст"],
            ["cacc", "Акцент"],
          ] as const).map(([k, label]) => (
            <label key={k} className="block text-xs font-semibold text-ink-soft">
              {label}
              <input
                type="color"
                value={value[k] || (k === "cbg" ? "#FAF4E8" : k === "cfg" ? "#3A2E28" : "#C25E3F")}
                onChange={(e) => onChange({ [k]: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-ink/15"
                aria-label={`Цвят: ${label}`}
              />
            </label>
          ))}
        </div>
      )}

      {!hideFont && (
        <>
          <div>
            <span className="field-label">Основен шрифт</span>
            <FontPicker value={value.font} onChange={(id) => onChange({ font: id })} allowDefault />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Slider
              label="Разредка"
              min={-0.03}
              max={0.3}
              step={0.005}
              value={value.tracking ?? 0}
              suffix="em"
              onChange={(v) => onChange({ tracking: v })}
            />
            <Slider
              label="Тегло"
              min={300}
              max={800}
              step={100}
              value={value.weight ?? 400}
              onChange={(v) => onChange({ weight: v })}
            />
            <Slider
              label="Редова разредка"
              min={1}
              max={2}
              step={0.05}
              value={value.leading ?? 1.4}
              onChange={(v) => onChange({ leading: v })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={!!value.italic}
              onChange={(e) => onChange({ italic: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            <span className="italic">Наклонен (курсив)</span>
          </label>
        </>
      )}

      {!hideDecor && (
        <div>
          <label className="field-label" htmlFor="decor-pick">Украса на фона</label>
          <select
            id="decor-pick"
            className="field-input"
            value={value.decor || "none"}
            onChange={(e) => onChange({ decor: e.target.value })}
          >
            {DECORS.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          {value.decor && value.decor !== "none" && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-ink-soft">
                Цвят на украсата
                <input
                  type="color"
                  value={value.decorColor || "#C25E3F"}
                  onChange={(e) => onChange({ decorColor: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-ink/15"
                  aria-label="Цвят на украсата"
                />
              </label>
              <Slider
                label="Прозрачност"
                min={0.05}
                max={1}
                step={0.05}
                value={value.decorOpacity ?? 1}
                onChange={(v) => onChange({ decorOpacity: v })}
              />
              <Slider
                label="Мащаб"
                min={0.5}
                max={2}
                step={0.1}
                value={value.decorScale ?? 1}
                suffix="×"
                onChange={(v) => onChange({ decorScale: v })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-ink-soft">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-ink-faint">
          {step < 1 ? value.toFixed(2) : value}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-4 w-full accent-tera"
        aria-label={label}
      />
    </label>
  );
}
