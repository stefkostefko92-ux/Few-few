"use client";

import { LABEL_PRESETS, sheetGrid } from "@/lib/print";
import { themeById } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import PrintBar from "@/components/PrintBar";
import SheetPreview from "@/components/SheetPreview";
import ThemePicker from "@/components/ThemePicker";

interface LabelState {
  presetId: string;
  themeId: string;
  text1: string;
  text2: string;
  cutLines: boolean;
  aiDesc: string;
}

const INITIAL: LabelState = {
  presetId: "70x36",
  themeId: "med",
  text1: "Домашно сладко",
  text2: "ягода · 2026",
  cutLines: true,
  aiDesc: "",
};

export default function LabelStudio() {
  const [s, setS] = useLocalState<LabelState>("mastilko-labels", INITIAL);
  const preset = LABEL_PRESETS.find((p) => p.id === s.presetId) ?? LABEL_PRESETS[0]!;
  const theme = themeById(s.themeId);
  // Правоъгълните се режат по общи линии (без междина); кръгли/овални — с 3 mm.
  const gap = preset.shape === "rect" ? 0 : 3;
  const grid = sheetGrid(preset.w, preset.h, preset.margin ?? 7, gap, gap);

  const radius =
    preset.shape === "circle" ? "50%" : preset.shape === "round" ? "50% / 45%" : "2.5mm";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* Контроли */}
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="preset" className="field-label">Размер и форма</label>
            <select
              id="preset"
              className="field-input"
              value={s.presetId}
              onChange={(e) => setS({ ...s, presetId: e.target.value })}
            >
              {LABEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="field-label">Цветова тема</span>
            <ThemePicker value={s.themeId} onChange={(id) => setS({ ...s, themeId: id })} />
          </div>

          <div>
            <label htmlFor="text1" className="field-label">Основен текст</label>
            <input
              id="text1"
              className="field-input"
              maxLength={40}
              value={s.text1}
              onChange={(e) => setS({ ...s, text1: e.target.value })}
              placeholder="напр. Домашно сладко"
            />
          </div>

          <div>
            <label htmlFor="text2" className="field-label">Втори ред (по желание)</label>
            <input
              id="text2"
              className="field-input"
              maxLength={50}
              value={s.text2}
              onChange={(e) => setS({ ...s, text2: e.target.value })}
              placeholder="напр. ягода · 2026"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.cutLines}
              onChange={(e) => setS({ ...s, cutLines: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Пунктирани линии за рязане
          </label>
        </div>

        <div className="card-warm space-y-3 p-5">
          <label htmlFor="aiDesc" className="field-label">
            ✨ Не ти хрумва текст? Опиши за какво е етикетът:
          </label>
          <input
            id="aiDesc"
            className="field-input"
            maxLength={200}
            value={s.aiDesc}
            onChange={(e) => setS({ ...s, aiDesc: e.target.value })}
            placeholder="напр. буркани с лютеница от градината на баба"
          />
          <AiAssist
            mode="label"
            input={s.aiDesc}
            label="Предложи текст с AI"
            onPick={(text) => {
              const [t1, t2] = text.split("|").map((p) => p.trim());
              setS({ ...s, text1: t1 ?? text, text2: t2 ?? "" });
            }}
          />
        </div>
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar summary={`${grid.total} етикета (${preset.name.toLowerCase()}) на лист А4`} />
        <SheetPreview>
          {Array.from({ length: grid.total }).map((_, i) => {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const left = grid.offsetX + col * (preset.w + grid.gapX);
            const top = grid.offsetY + row * (preset.h + grid.gapY);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${left}mm`,
                  top: `${top}mm`,
                  width: `${preset.w}mm`,
                  height: `${preset.h}mm`,
                  background: theme.bg,
                  color: theme.fg,
                  borderRadius: radius,
                  border: s.cutLines
                    ? "0.3mm dashed rgba(120,110,100,0.55)"
                    : `0.5mm solid ${theme.accent}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "4% 6%",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: `${Math.min(preset.h * 0.2, 9)}mm`,
                    lineHeight: 1.15,
                  }}
                >
                  {s.text1 || "…"}
                </span>
                {s.text2 && (
                  <span
                    style={{
                      marginTop: "1mm",
                      fontSize: `${Math.min(preset.h * 0.12, 5)}mm`,
                      opacity: 0.85,
                    }}
                  >
                    {s.text2}
                  </span>
                )}
              </div>
            );
          })}
        </SheetPreview>
      </div>
    </div>
  );
}
