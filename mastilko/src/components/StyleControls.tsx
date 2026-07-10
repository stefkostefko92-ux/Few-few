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
        <div>
          <span className="field-label">Основен шрифт</span>
          <FontPicker value={value.font} onChange={(id) => onChange({ font: id })} allowDefault />
        </div>
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
        </div>
      )}
    </div>
  );
}
