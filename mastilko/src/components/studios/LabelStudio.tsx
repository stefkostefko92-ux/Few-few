"use client";

import { z } from "zod";
import { LABEL_PRESETS, MAX_SHEETS, sheetGrid } from "@/lib/print";
import { BARCODE_TYPES, checkBarcode, type BarcodeType } from "@/lib/barcode";
import { fillNumber, formatNumber, layoutSheets, nthNumber, splitLine } from "@/lib/labels";
import { resolveTheme, fontVars, resolveDecor, sheetBg, qrSafeColor, readableAccent, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import FitHeight from "@/components/FitHeight";
import FitText from "@/components/FitText";
import AiAssist from "@/components/AiAssist";
import BackgroundDecor from "@/components/BackgroundDecor";
import Barcode from "@/components/Barcode";
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
  /** Стъпка на номерацията (1, 2, 10…). */
  numberStep: number;
  /** Водещи нули — минимален брой цифри (0 = без). */
  numberPad: number;
  numberPrefix: string;
  numberSuffix: string;
  /** Колко листа при „Еднакви“ (напр. 100 номерирани стикера). */
  sheetCount: number;
  /** „Свой размер“ (presetId = "custom"): размерите от опаковката, в mm. */
  customW: number;
  customH: number;
  customGapX: number;
  customGapY: number;
  customMargin: number;
  /** URL за QR код върху всеки етикет (празно = без QR). */
  qrUrl: string;
  cutLines: boolean;
  aiDesc: string;
  /** Начеван лист: пропусни първите N клетки (вече използвани етикети). */
  skipCells: number;
  /** Баркод върху всеки етикет. */
  barcode: boolean;
  /** Формат на баркода. */
  barcodeType: BarcodeType;
  /** Стойност на баркода. */
  barcodeValue: string;
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
    numberStep: z.number().int().min(1).max(1000),
    numberPad: z.number().int().min(0).max(8),
    numberPrefix: z.string().max(12),
    numberSuffix: z.string().max(12),
    // 100 = MAX_SHEETS; литерал, защото огледалният тест на MCP чете числото от кода.
    sheetCount: z.number().int().min(1).max(100),
    customW: z.number().min(10).max(200),
    customH: z.number().min(10).max(287),
    customGapX: z.number().min(0).max(20),
    customGapY: z.number().min(0).max(20),
    customMargin: z.number().min(0).max(20),
    qrUrl: z.string().max(300),
    cutLines: z.boolean(),
    aiDesc: z.string().max(300),
    skipCells: z.number().int().min(0).max(200),
    barcode: z.boolean(),
    barcodeType: z.enum(BARCODE_TYPES),
    barcodeValue: z.string().max(48),
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
  numberStep: 1,
  numberPad: 0,
  numberPrefix: "№ ",
  numberSuffix: "",
  sheetCount: 1,
  customW: 64,
  customH: 34,
  customGapX: 2,
  customGapY: 0,
  customMargin: 6,
  qrUrl: "",
  cutLines: true,
  aiDesc: "",
  skipCells: 0,
  barcode: false,
  barcodeType: "CODE128",
  barcodeValue: "",
};

interface CellContent {
  text1: string;
  text2: string;
  /** Форматираният номер („№ 7“, „INV-0007“) или null без номерация. */
  num: string | null;
  /** Стойността на баркода за ТОЗИ етикет („{N}“ → номерът). */
  barcode: string;
}

/** Съдържанието на етикет с пореден индекс i в серията (null = няма ред). */
function cellContent(s: LabelState, lines: string[], i: number): CellContent | null {
  const n = nthNumber(s.numberStart, s.numberStep || 1, i);
  const digits = s.numberPad > 0 ? String(n).padStart(s.numberPad, "0") : String(n);
  const num = s.numbering
    ? formatNumber(n, { prefix: s.numberPrefix ?? "", suffix: s.numberSuffix ?? "", pad: s.numberPad ?? 0 })
    : null;
  const barcode = fillNumber(s.barcodeValue, digits);
  if (s.mode === "list") {
    const line = lines[i];
    if (!line) return null;
    const [text1, text2] = splitLine(line);
    return { text1, text2, num, barcode };
  }
  return { text1: s.text1, text2: s.text2, num, barcode };
}

export default function LabelStudio() {
  const [s, setS] = useLocalState<LabelState>("mastilko-labels", INITIAL, (r) => ProjectSchema.parse(r));
  // „Свой размер“ — за листове, които не са в списъка (размерите са на опаковката).
  const custom = s.presetId === "custom";
  const preset = custom
    ? { id: "custom", name: `Свой размер (${s.customW} × ${s.customH} mm)`, w: s.customW, h: s.customH, shape: "rect" as const, margin: s.customMargin, gapX: s.customGapX }
    : (LABEL_PRESETS.find((p) => p.id === s.presetId) ?? LABEL_PRESETS[0]!);
  const theme = resolveTheme(s);
  // Правоъгълните се режат по общи линии (без междина); кръгли/овални — с 3 mm.
  const gap = preset.shape === "rect" ? 0 : 3;
  const firstDigits = s.numberPad > 0 ? String(s.numberStart).padStart(s.numberPad, "0") : String(s.numberStart);
  const barcodeCheck = checkBarcode(s.barcodeType, fillNumber(s.barcodeValue, firstDigits));
  const grid = sheetGrid(preset.w, preset.h, preset.margin ?? 7, preset.gapX ?? gap, custom ? s.customGapY : gap);

  const set = (patch: Partial<LabelState>) => setS({ ...s, ...patch });

  const listLines =
    s.mode === "list"
      ? s.listText.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];
  // Начеван лист: първите N клетки са вече изразходвани → печатаме от N нататък.
  const skip = Math.min(s.skipCells ?? 0, Math.max(0, grid.total - 1));
  const capacity = grid.total - skip;
  // Списъкът вече НЕ спира на първия лист — колкото реда, толкова етикета, на
  // колкото листа трябва (досега редовете след първия лист просто изчезваха).
  const count = s.mode === "list"
    ? listLines.length
    : capacity + grid.total * (Math.max(1, s.sheetCount ?? 1) - 1);
  const sheets = layoutSheets(count, grid.total, skip);
  const printed = sheets.reduce((a, sh) => a + sh.length, 0);
  const notPrinted = count - printed;

  const qrText = s.qrUrl.trim()
    ? /^https?:\/\//i.test(s.qrUrl.trim())
      ? s.qrUrl.trim()
      : `https://${s.qrUrl.trim()}`
    : "";
  // Един QR за целия лист — не по един на клетка.
  const qrSrc = useQrDataUrl(qrText, s.qrColor ? qrSafeColor(theme.accent) : undefined);

  // Експорт на контурите (cut lines) като A4 SVG в mm — за режещо плоте
  // (Cricut/Silhouette): печаташ листа, после машината реже по същите позиции.
  function downloadCutSvg() {
    const parts: string[] = [];
    // Контурите на първия лист (със заетите клетки на начевания лист
    // пропуснати); следващите листове са със същата решетка.
    for (const { cell: i } of sheets[0] ?? []) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const x = grid.offsetX + col * (preset.w + grid.gapX);
      const y = grid.offsetY + row * (preset.h + grid.gapY);
      const cx = (x + preset.w / 2).toFixed(2);
      const cy = (y + preset.h / 2).toFixed(2);
      const stroke = `fill="none" stroke="#000" stroke-width="0.1"`;
      if (preset.shape === "circle") {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${(preset.w / 2).toFixed(2)}" ${stroke}/>`);
      } else if (preset.shape === "round") {
        parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${(preset.w / 2).toFixed(2)}" ry="${(preset.h / 2).toFixed(2)}" ${stroke}/>`);
      } else {
        parts.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${preset.w}" height="${preset.h}" rx="2.5" ${stroke}/>`);
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">${parts.join("")}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mastilko-rezhi.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  const radius =
    preset.shape === "circle" ? "50%" : preset.shape === "round" ? "50% / 45%" : "2.5mm";
  const qrSize = Math.min(preset.h, preset.w) * 0.6;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
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
              <option value="custom">Свой размер…</option>
            </select>
            {custom && (
              <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
                {([
                  ["customW", "Ширина", 10, 200],
                  ["customH", "Височина", 10, 287],
                  ["customGapX", "Междина ↔", 0, 20],
                  ["customGapY", "Междина ↕", 0, 20],
                  ["customMargin", "Мин. поле", 0, 20],
                ] as const).map(([k, label, min, max]) => (
                  <label key={k} className="text-xs font-semibold text-ink-soft">
                    {label} (mm)
                    <input
                      type="number"
                      step={0.1}
                      min={min}
                      max={max}
                      className="field-input !py-1"
                      value={s[k]}
                      onChange={(e) => set({ [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })}
                    />
                  </label>
                ))}
                <p className="col-span-full text-xs text-ink-faint" aria-live="polite">
                  {grid.total > 0
                    ? `${grid.cols} × ${grid.rows} = ${grid.total} на лист · отляво ${grid.offsetX.toFixed(1)} mm, отгоре ${grid.offsetY.toFixed(1)} mm — сравни с опаковката.`
                    : "Етикетът не се събира на А4 с тези размери."}
                </p>
              </div>
            )}
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
              <div>
                <label htmlFor="sheet-count" className="field-label">Брой листове</label>
                <input
                  id="sheet-count"
                  type="number"
                  className="field-input !w-28"
                  min={1}
                  max={MAX_SHEETS}
                  value={s.sheetCount ?? 1}
                  onChange={(e) => set({ sheetCount: Math.min(MAX_SHEETS, Math.max(1, Number(e.target.value) || 1)) })}
                />
                <p className="mt-1 text-xs text-ink-faint">
                  С номерация номерата продължават на следващия лист — напр. 100
                  инвентарни стикера на 5 листа.
                </p>
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
                {listLines.length} реда · {grid.total} места на лист ·{" "}
                <strong className="text-ink-soft">{sheets.length} {sheets.length === 1 ? "лист" : "листа"}</strong>
                {notPrinted > 0 && (
                  <strong className="text-ink">
                    {" "}· ⚠ {notPrinted} реда над тавана от {MAX_SHEETS} листа — раздели списъка
                  </strong>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Две колони от Excel или Google Sheets се поставят направо —
                табулацията става разделител между първия и втория ред.
              </p>
              <button
                type="button"
                className="btn-secondary mt-2 text-sm"
                onClick={() => set({
                  listText: [
                    "Математика | Име Фамилия",
                    "Български език и литература | Име Фамилия",
                    "Английски език | Име Фамилия",
                    "История | Име Фамилия",
                    "География | Име Фамилия",
                    "Биология | Име Фамилия",
                    "Химия | Име Фамилия",
                    "Физика | Име Фамилия",
                    "Информатика | Име Фамилия",
                    "Физическо възпитание | Име Фамилия",
                  ].join("\n"),
                })}
              >
                Попълни ученически предмети
              </button>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={s.numbering}
                onChange={(e) => set({ numbering: e.target.checked })}
                className="h-4 w-4 accent-tera"
              />
              Автоматична номерация
            </label>
            {s.numbering && (
              <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
                {([
                  ["numberStart", "Начало", 0, 99999],
                  ["numberStep", "Стъпка", 1, 1000],
                  ["numberPad", "Цифри (водещи 0)", 0, 8],
                ] as const).map(([k, label, min, max]) => (
                  <label key={k} className="text-xs font-semibold text-ink-soft">
                    {label}
                    <input
                      type="number"
                      className="field-input !py-1"
                      min={min}
                      max={max}
                      value={s[k] ?? min}
                      onChange={(e) => set({ [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })}
                    />
                  </label>
                ))}
                <label className="text-xs font-semibold text-ink-soft">
                  Префикс
                  <input className="field-input !py-1" maxLength={12} value={s.numberPrefix ?? ""}
                    onChange={(e) => set({ numberPrefix: e.target.value })} placeholder="№ " />
                </label>
                <label className="text-xs font-semibold text-ink-soft">
                  Суфикс
                  <input className="field-input !py-1" maxLength={12} value={s.numberSuffix ?? ""}
                    onChange={(e) => set({ numberSuffix: e.target.value })} placeholder="/2026" />
                </label>
                <p className="col-span-full text-xs text-ink-faint">
                  Пример: {formatNumber(s.numberStart, { prefix: s.numberPrefix ?? "", suffix: s.numberSuffix ?? "", pad: s.numberPad ?? 0 })},{" "}
                  {formatNumber(nthNumber(s.numberStart, s.numberStep || 1, 1), { prefix: s.numberPrefix ?? "", suffix: s.numberSuffix ?? "", pad: s.numberPad ?? 0 })}…
                  {" "}Сложи <code>{"{N}"}</code> в баркода и всеки етикет получава своя номер.
                </p>
              </div>
            )}
          </div>

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
            {s.qrUrl.trim() && (
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <input
                  type="checkbox"
                  checked={!!s.qrColor}
                  onChange={(e) => set({ qrColor: e.target.checked })}
                  className="h-4 w-4 accent-tera"
                />
                QR в акцентния цвят (ако е скенируем)
              </label>
            )}
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

          <div>
            <label htmlFor="skip-cells" className="field-label">
              Начеван лист — пропусни първите клетки
            </label>
            <div className="flex items-center gap-3">
              <input
                id="skip-cells"
                type="range"
                min={0}
                max={Math.max(0, grid.total - 1)}
                step={1}
                value={skip}
                onChange={(e) => set({ skipCells: Number(e.target.value) })}
                className="h-4 flex-1 accent-tera"
              />
              <span className="tabular-nums text-sm font-semibold text-ink-soft">{skip}</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              Ползвал си вече част от листа със стикери? Печатаме от следващата
              свободна клетка — нищо не се хаби. Остават {capacity} свободни.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={s.barcode}
                onChange={(e) => set({ barcode: e.target.checked })}
                className="h-4 w-4 accent-tera"
              />
              Баркод (за продукти/цени)
            </label>
            {s.barcode && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
                <select
                  className="field-input !w-auto"
                  value={s.barcodeType}
                  onChange={(e) => set({ barcodeType: e.target.value as LabelState["barcodeType"] })}
                  aria-label="Формат на баркода"
                >
                  <option value="CODE128">Code 128</option>
                  <option value="EAN13">EAN-13</option>
                  <option value="EAN8">EAN-8</option>
                  <option value="UPC">UPC-A</option>
                  <option value="ITF14">ITF-14 (кашони)</option>
                  <option value="CODE39">Code 39</option>
                </select>
                <input
                  className="field-input"
                  maxLength={48}
                  value={s.barcodeValue}
                  onChange={(e) => set({ barcodeValue: e.target.value })}
                  placeholder={s.barcodeType === "CODE128" ? "напр. INV-{N}" : "напр. 3800000000001"}
                  aria-label="Стойност на баркода"
                />
                {/* Защо липсва баркодът — казваме веднага (най-често: грешна
                    контролна цифра на EAN-13), вместо той просто да изчезне. */}
                {barcodeCheck.message && (
                  <p role={barcodeCheck.ok ? undefined : "alert"}
                    className={`text-xs sm:col-span-2 ${barcodeCheck.ok ? "text-ink-soft" : "font-semibold text-ink"}`}>
                    {barcodeCheck.ok ? "✓ " : "⚠ "}{barcodeCheck.message}
                  </p>
                )}
                <p className="text-xs text-ink-faint sm:col-span-2">
                  EAN-13 иска 12–13 цифри, EAN-8 — 7–8, UPC — 11–12, ITF-14 —
                  13–14 (при по-кратката дължина контролната цифра се добавя
                  сама). Кодът се генерира в браузъра.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-ink/10 pt-3">
            <button type="button" className="btn-secondary text-sm" onClick={downloadCutSvg}>
              <Icon name="download" className="h-4 w-4" /> Свали SVG за рязане (Cricut/Silhouette)
            </button>
            <p className="mt-1 text-xs text-ink-faint">
              Контурите на етикетите като SVG в mm — зареждаш го в машината за
              рязане (print-then-cut) на същите позиции като разпечатката.
            </p>
          </div>
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
          filename="mastilko-etiketi" storageKey="mastilko-labels"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })}
        />
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar
          summary={`${printed} етикета (${preset.name.toLowerCase()}) на ${sheets.length} ${sheets.length === 1 ? "лист" : "листа"} А4`}
        />
        {sheets.map((sheet, si) => (
        <SheetPreview key={si} style={fontVars(s)}>
          {sheet.map(({ cell: i, index: ci }) => {
            const content = cellContent(s, listLines, ci);
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
                  // Поле спрямо ЕТИКЕТА: „4% 6%“ при абсолютна клетка се смяташе
                  // от ширината на целия лист (≈ 8 mm отгоре/отдолу) — на мини
                  // етикет 38 × 21 оставаха ~4 mm за текста.
                  padding: `${(preset.w * 0.04).toFixed(2)}mm ${(preset.w * 0.06).toFixed(2)}mm`,
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
                {/* FitHeight: дълъг текст на малък етикет се режеше отгоре и
                    отдолу (клетката е overflow:hidden) — сега се смалява. */}
                <FitHeight
                  watch={`${content.text1}|${content.text2}|${content.num}|${preset.id}|${qrSize}|${s.barcode}|${JSON.stringify(s.fonts ?? {})}|${s.leading}`}
                  scale={s.textScale ?? 1}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 0,
                    maxHeight: "100%",
                  }}
                >
                  <FitText
                    text={content.text1 || "…"}
                    fontSize={fs(Math.min(preset.h * 0.2, 9))}
                    watch={s.textScale}
                    style={{ fontWeight: 800, lineHeight: 1.15 }}
                  />
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
                        // Затъмнен акцент — светлите акценти падаха под AA при печат.
                        color: readableAccent(theme.accent, theme.bg),
                      }}
                    >
                      {content.num}
                    </span>
                  )}
                  {s.barcode && content.barcode.trim() && (
                    <Barcode
                      value={content.barcode}
                      format={s.barcodeType}
                      color={theme.fg}
                      style={{ marginTop: "1mm", width: "92%", height: `${Math.min(preset.h * 0.42, 14)}mm` }}
                    />
                  )}
                </FitHeight>
              </div>
            );
          })}
        </SheetPreview>
        ))}
      </div>
    </div>
  );
}
