"use client";

import { DECORS, contrastRatio, contrastGrade, inkCoverage, cmykRisk, resolveTheme, type StyleState } from "@/lib/style";
import ThemePicker from "@/components/ThemePicker";
import FontPicker from "@/components/FontPicker";
import Icon from "@/components/Icon";

const BORDER_STYLES: Array<{ id: NonNullable<StyleState["bstyle"]>; name: string }> = [
  { id: "solid", name: "Плътна" },
  { id: "dashed", name: "Пунктир" },
  { id: "dotted", name: "Точки" },
  { id: "double", name: "Двойна" },
  { id: "none", name: "Без рамка" },
];

interface Props {
  value: StyleState;
  onChange: (patch: Partial<StyleState>) => void;
  /** Скрий избора на шрифт. */
  hideFont?: boolean;
  /** Скрий украсата на фона (напр. за документи като CV). */
  hideDecor?: boolean;
  /** Скрий настройките на рамката (напр. за инструменти без рамка). */
  hideBorder?: boolean;
  /** Покажи филтър за снимки/лога (инструменти с изображения). */
  showPhotoFx?: boolean;
  /** Покажи ефекти за декоративни заглавия (градиент/сянка). */
  showTitleFx?: boolean;
}

// Общ панел за персонализация: тема или свои цветове + шрифт + украса на фона.
// Ползва се от всички редактори, за да е поведението еднакво навсякъде.
export default function StyleControls({ value, onChange, hideFont, hideDecor, hideBorder, showPhotoFx, showTitleFx }: Props) {
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

      {value.customColors && (
        <ContrastReport
          bg={value.cbg || "#FAF4E8"}
          fg={value.cfg || "#3A2E28"}
          acc={value.cacc || "#C25E3F"}
        />
      )}

      {value.customColors && [value.cbg, value.cfg, value.cacc].some((c) => c && cmykRisk(c)) && (
        <p className="rounded-lg bg-tera/10 p-2 text-xs font-semibold text-tera-dark">
          Някои цветове са много наситени (неонови) и на хартия може да излязат
          по-матово/различно от екрана. За сигурен резултат избери малко
          по-меки тонове.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
          <input
            type="checkbox"
            checked={!!value.ecoMode}
            onChange={(e) => onChange({ ecoMode: e.target.checked })}
            className="h-4 w-4 accent-tera"
          />
          Мастило-пестелив (еко) режим
        </label>
        {(() => {
          const cov = inkCoverage(value, resolveTheme(value));
          return (
            <span className={`text-xs font-semibold ${cov.heavy ? "text-tera-dark" : "text-ink-faint"}`}>
              Мастило: {cov.label}
            </span>
          );
        })()}
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <input
          type="checkbox"
          checked={!!value.bgGrad}
          onChange={(e) => onChange({ bgGrad: e.target.checked })}
          className="h-4 w-4 accent-tera"
        />
        <Icon name="palette" className="h-4 w-4" /> Градиентен фон
      </label>

      {value.bgGrad && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-soft">
            Втори цвят
            <input
              type="color"
              value={value.cbg2 || "#F3D9C0"}
              onChange={(e) => onChange({ cbg2: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-ink/15"
              aria-label="Втори цвят на градиента"
            />
          </label>
          <Slider
            label="Ъгъл"
            min={0}
            max={360}
            step={15}
            value={value.bgAngle ?? 135}
            suffix="°"
            onChange={(v) => onChange({ bgAngle: v })}
          />
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={!!value.italic}
                onChange={(e) => onChange({ italic: e.target.checked })}
                className="h-4 w-4 accent-tera"
              />
              <span className="italic">Наклонен (курсив)</span>
            </label>
            <div className="min-w-40 flex-1">
              <Slider
                label="Размер на текста"
                min={0.8}
                max={1.3}
                step={0.05}
                value={value.textScale ?? 1}
                suffix="×"
                onChange={(v) => onChange({ textScale: v })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={!!value.dyslexia}
              onChange={(e) => onChange({ dyslexia: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Четим режим за дислексия
          </label>
        </>
      )}

      {showTitleFx && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={!!value.titleGradient}
              onChange={(e) => onChange({ titleGradient: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Градиентно заглавие
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={!!value.titleShadow}
              onChange={(e) => onChange({ titleShadow: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Релефна сянка
          </label>
        </div>
      )}

      {showPhotoFx && (
        <div>
          <label className="field-label" htmlFor="photo-filter">Филтър на снимки/лога</label>
          <select
            id="photo-filter"
            className="field-input"
            value={value.photoFilter || "none"}
            onChange={(e) => onChange({ photoFilter: e.target.value as StyleState["photoFilter"] })}
          >
            <option value="none">Без филтър</option>
            <option value="gray">Черно-бяло</option>
            <option value="sepia">Сепия</option>
            <option value="duo">Дуотон</option>
          </select>
        </div>
      )}

      {!hideBorder && (
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={!!value.bord}
              onChange={(e) => onChange({ bord: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            <Icon name="palette" className="h-4 w-4" /> Своя рамка
          </label>

          {value.bord && (
            <div className="mt-2 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-ink-soft">
                  Стил
                  <select
                    className="field-input mt-1"
                    value={value.bstyle || "solid"}
                    onChange={(e) => onChange({ bstyle: e.target.value as StyleState["bstyle"] })}
                  >
                    {BORDER_STYLES.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-ink-soft">
                  Цвят
                  <input
                    type="color"
                    value={value.bcolor || "#C25E3F"}
                    onChange={(e) => onChange({ bcolor: e.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-ink/15"
                    aria-label="Цвят на рамката"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Slider
                  label="Дебелина"
                  min={0}
                  max={8}
                  step={0.5}
                  value={value.bwidth ?? 1}
                  suffix="mm"
                  onChange={(v) => onChange({ bwidth: v })}
                />
                <Slider
                  label="Заобляне"
                  min={0}
                  max={20}
                  step={1}
                  value={value.bradius ?? 0}
                  suffix="mm"
                  onChange={(v) => onChange({ bradius: v })}
                />
              </div>
            </div>
          )}
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

// Жив WCAG контраст-чекър — показва дали текстът/акцентът се четат на фона.
function ContrastReport({ bg, fg, acc }: { bg: string; fg: string; acc: string }) {
  const rows: Array<[string, number | null]> = [
    ["Текст върху фон", contrastRatio(fg, bg)],
    ["Акцент върху фон", contrastRatio(acc, bg)],
  ];
  return (
    <div className="space-y-1 rounded-lg bg-ink/5 p-2 text-xs">
      {rows.map(([label, ratio]) => {
        const grade = ratio !== null ? contrastGrade(ratio) : null;
        return (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="text-ink-soft">{label}</span>
            <span className="flex items-center gap-1.5 font-semibold">
              {ratio !== null && <span className="tabular-nums text-ink-faint">{ratio.toFixed(1)}:1</span>}
              <span
                className={`rounded px-1.5 py-0.5 ${
                  grade?.ok ? "bg-gora/15 text-gora-dark" : "bg-tera/15 text-tera-dark"
                }`}
              >
                {grade ? grade.label : "—"}
              </span>
            </span>
          </div>
        );
      })}
      <p className="pt-0.5 text-ink-faint">Цел: поне „AA“ (4.5:1) за да се чете лесно.</p>
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
