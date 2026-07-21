"use client";

import { z } from "zod";
import { LABEL_PRESETS, sheetGrid } from "@/lib/print";
import { resolveTheme, fontVars, resolveDecor, sheetBg, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import BackgroundDecor from "@/components/BackgroundDecor";
import Icon from "@/components/Icon";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import QrImage, { useQrDataUrl } from "@/components/QrImage";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); печатната математика в mm
// не се влияе — само размерите на шрифта се умножават.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface LabelState extends StyleState {
  presetId: string;
  themeId: string;
  /** "same" = всички етикети еднакви; "list" = по един етикет на ред. */
  mode: "same" | "list";
  text1: string;
  text2: string;
  /** Списък: по един етикет на ред, втори ред след „|“. */
  listText: string;
  numbering: boolean;
  numberStart: number;
  /** URL за QR код върху всеки етикет (празно = без QR). */
  qrUrl: string;
  cutLines: boolean;
  aiDesc: string;
}

// Валидация на качен проект-файл: грешен тип стойност иначе сменя правилно
// типизираните подразбирания и чупи рендера (напр. listText: 5 → .split гърми).
const ProjectSchema = z
  .object({
    presetId: z.string().max(20),
    ...StyleSchemaShape,
    mode: z.enum(["same", "list"]),
    text1: z.string().max(60),
    text2: z.string().max(80),
    listText: z.string().max(4000),
    numbering: z.boolean(),
    numberStart: z.number().int().min(0).max(99999),
    qrUrl: z.string().max(300),
    cutLines: z.boolean(),
    aiDesc: z.string().max(300),
  })
  .partial();

const INITIAL: LabelState = {
  presetId: "70x36",
  themeId: "med",
  mode: "same",
  text1: "Домашно сладко",
  text2: "ягода · 2026",
  listText: "босилек\nриган\nчубрица\nмента | сушена, 2026",
  numbering: false,
  numberStart: 1,
  qrUrl: "",
  cutLines: true,
  aiDesc: "",
};

interface CellContent {
  text1: string;
  text2: string;
  num: number | null;
}

/** Съдържанието на клетка i от листа (null = празна клетка, не се печата). */
function cellContent(s: LabelState, lines: string[], i: number): CellContent | null {
  const num = s.numbering ? s.numberStart + i : null;
  if (s.mode === "list") {
    const line = lines[i];
    if (!line) return null;
    const [t1, t2] = line.split("|").map((p) => p.trim());
    return { text1: t1 ?? line, text2: t2 ?? "", num };
  }
  return { text1: s.text1, text2: s.text2, num };
}

export default function LabelStudio() {
  const [s, setS] = useLocalState<LabelState>("mastilko-labels", INITIAL, (r) => ProjectSchema.parse(r));
  const preset = LABEL_PRESETS.find((p) => p.id === s.presetId) ?? LABEL_PRESETS[0]!;
  const theme = resolveTheme(s);
  // Правоъгълните се режат по общи линии (без междина); кръгли/овални — с 3 mm.
  const gap = preset.shape === "rect" ? 0 : 3;
  const grid = sheetGrid(preset.w, preset.h, preset.margin ?? 7, gap, gap);

  const set = (patch: Partial<LabelState>) => setS({ ...s, ...patch });

  const listLines =
    s.mode === "list"
      ? s.listText.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];
  const usedCells = s.mode === "list" ? Math.min(listLines.length, grid.total) : grid.total;
  const overflow = s.mode === "list" ? Math.max(0, listLines.length - grid.total) : 0;

  const qrText = s.qrUrl.trim()
    ? /^https?:\/\//i.test(s.qrUrl.trim())
      ? s.qrUrl.trim()
      : `https://${s.qrUrl.trim()}`
    : "";
  // Един QR за целия лист — не по един на клетка.
  const qrSrc = useQrDataUrl(qrText);

  const radius =
    preset.shape === "circle" ? "50%" : preset.shape === "round" ? "50% / 45%" : "2.5mm";
  const qrSize = Math.min(preset.h, preset.w) * 0.6;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* Контроли */}
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="preset" className="field-label">Размер и форма</label>
            <select
              id="preset"
              className="field-input"
              value={s.presetId}
              onChange={(e) => set({ presetId: e.target.value })}
            >
              {LABEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <StyleControls value={s} onChange={set} hideBorder />

          <fieldset>
            <legend className="field-label">Съдържание</legend>
            <div className="flex gap-2">
              <label className={`flex-1 cursor-pointer rounded-xl border-2 px-3 py-2 text-center text-sm font-semibold ${s.mode === "same" ? "border-tera bg-tera-pale/60 dark:bg-white/10 vivid:bg-white/10" : "border-ink/10"}`}>
                <input
                  type="radio"
                  name="label-mode"
                  className="sr-only"
                  checked={s.mode === "same"}
                  onChange={() => set({ mode: "same" })}
                />
                Еднакви
              </label>
              <label className={`flex-1 cursor-pointer rounded-xl border-2 px-3 py-2 text-center text-sm font-semibold ${s.mode === "list" ? "border-tera bg-tera-pale/60 dark:bg-white/10 vivid:bg-white/10" : "border-ink/10"}`}>
                <input
                  type="radio"
                  name="label-mode"
                  className="sr-only"
                  checked={s.mode === "list"}
                  onChange={() => set({ mode: "list" })}
                />
                Различни (списък)
              </label>
            </div>
          </fieldset>

          {s.mode === "same" ? (
            <>
              <div>
                <label htmlFor="text1" className="field-label">Основен текст</label>
                <input
                  id="text1"
                  className="field-input"
                  maxLength={40}
                  value={s.text1}
                  onChange={(e) => set({ text1: e.target.value })}
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
                  onChange={(e) => set({ text2: e.target.value })}
                  placeholder="напр. ягода · 2026"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="listText" className="field-label">
                По един етикет на ред (втори ред след „|“)
              </label>
              <textarea
                id="listText"
                className="field-input min-h-32 font-mono text-sm"
                maxLength={2000}
                value={s.listText}
                onChange={(e) => set({ listText: e.target.value })}
                placeholder={"босилек\nриган\nмента | сушена, 2026"}
              />
              <p className="mt-1 text-xs text-ink-faint">
                {listLines.length} реда · {grid.total} места на листа
                {overflow > 0 && (
                  <strong className="text-tera-dark">
                    {" "}· {overflow} не се събират — избери по-малък размер или втори лист
                  </strong>
                )}
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.numbering}
              onChange={(e) => set({ numbering: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Автоматична номерация
            {s.numbering && (
              <input
                type="number"
                aria-label="Начален номер"
                className="field-input !w-24 !py-1"
                min={0}
                max={99999}
                value={s.numberStart}
                onChange={(e) =>
                  set({ numberStart: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            )}
          </label>

          <div>
            <label htmlFor="qrUrl" className="field-label">
              QR код с линк (по желание)
            </label>
            <input
              id="qrUrl"
              className="field-input"
              maxLength={200}
              value={s.qrUrl}
              onChange={(e) => set({ qrUrl: e.target.value })}
              placeholder="напр. mechta.bg/lyutenitsa"
            />
            <p className="mt-1 text-xs text-ink-faint">
              Генерира се в твоя браузър — нищо не се изпраща навън.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.cutLines}
              onChange={(e) => set({ cutLines: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Пунктирани линии за рязане
          </label>
        </div>

        <div className="card-warm space-y-3 p-5">
          <label htmlFor="aiDesc" className="field-label">
            <Icon name="sparkles" className="mr-1 h-4 w-4 align-[-3px]" /> Не ти хрумва текст? Опиши за какво е етикетът:
          </label>
          <input
            id="aiDesc"
            className="field-input"
            maxLength={200}
            value={s.aiDesc}
            onChange={(e) => set({ aiDesc: e.target.value })}
            placeholder="напр. буркани с лютеница от градината на баба"
          />
          <AiAssist
            mode="label"
            input={s.aiDesc}
            label="Предложи текст с AI"
            onPick={(text) => {
              const [t1, t2] = text.split("|").map((p) => p.trim());
              set({ mode: "same", text1: t1 ?? text, text2: t2 ?? "" });
            }}
          />
        </div>

        <ProjectFile
          state={s}
          filename="mastilko-etiketi"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })}
        />
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar
          summary={`${usedCells} етикета (${preset.name.toLowerCase()}) на лист А4`}
        />
        <SheetPreview style={fontVars(s)}>
          {Array.from({ length: grid.total }).map((_, i) => {
            const content = cellContent(s, listLines, i);
            if (!content) return null;
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
                  background: sheetBg(s, theme),
                  color: theme.fg,
                  borderRadius: radius,
                  border: s.cutLines
                    ? "0.3mm dashed rgba(120,110,100,0.55)"
                    : `0.5mm solid ${theme.accent}`,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2mm",
                  textAlign: "center",
                  padding: "4% 6%",
                  overflow: "hidden",
                }}
              >
                <BackgroundDecor decor={s.decor} {...resolveDecor(s, theme.accent)} />
                {qrSrc && (
                  <QrImage
                    src={qrSrc}
                    style={{
                      width: `${qrSize}mm`,
                      height: `${qrSize}mm`,
                      flexShrink: 0,
                      borderRadius: "1mm",
                      position: "relative",
                    }}
                  />
                )}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: fs(Math.min(preset.h * 0.2, 9)),
                      lineHeight: 1.15,
                    }}
                  >
                    {content.text1 || "…"}
                  </span>
                  {content.text2 && (
                    <span
                      style={{
                        marginTop: "1mm",
                        fontSize: fs(Math.min(preset.h * 0.12, 5)),
                        opacity: 0.85,
                      }}
                    >
                      {content.text2}
                    </span>
                  )}
                  {content.num !== null && (
                    <span
                      style={{
                        marginTop: "0.8mm",
                        fontSize: fs(Math.min(preset.h * 0.11, 4.5)),
                        fontWeight: 700,
                        color: theme.accent,
                      }}
                    >
                      № {content.num}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </SheetPreview>
      </div>
    </div>
  );
}
