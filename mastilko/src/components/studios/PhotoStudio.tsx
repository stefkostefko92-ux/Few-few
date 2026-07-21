"use client";

import { z } from "zod";
import { sheetGrid } from "@/lib/print";
import { useLocalState } from "@/lib/use-local-state";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";

interface PhotoState {
  image: string;
  size: "bg35x45" | "us51x51" | "small30x40";
  zoom: number;
  posX: number;
  posY: number;
  count: number;
  guide: boolean;
  frame: boolean;
}

const INITIAL: PhotoState = {
  image: "",
  size: "bg35x45",
  zoom: 1,
  posX: 50,
  posY: 45,
  count: 8,
  guide: true,
  frame: true,
};

const ProjectSchema = z
  .object({
    image: z.string().max(1500000),
    size: z.enum(["bg35x45", "us51x51", "small30x40"]),
    zoom: z.number().min(1).max(3),
    posX: z.number().min(0).max(100),
    posY: z.number().min(0).max(100),
    count: z.number().int().min(1).max(60),
    guide: z.boolean(),
    frame: z.boolean(),
  })
  .partial();

const SIZES: Record<PhotoState["size"], { w: number; h: number; name: string }> = {
  bg35x45: { w: 35, h: 45, name: "БГ / ЕС документи (35 × 45 mm)" },
  us51x51: { w: 51, h: 51, name: "Паспорт/виза САЩ (51 × 51 mm, 2×2\")" },
  small30x40: { w: 30, h: 40, name: "Малка (30 × 40 mm)" },
};

export default function PhotoStudio() {
  const [s, setS] = useLocalState<PhotoState>("mastilko-photo", INITIAL, (r) => ProjectSchema.parse(r));
  const set = (patch: Partial<PhotoState>) => setS({ ...s, ...patch });

  const size = SIZES[s.size];
  const grid = sheetGrid(size.w, size.h, 8, 2, 2);
  const perSheet = Math.max(1, grid.total);
  const total = Math.min(s.count, perSheet);

  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: `${s.posX}% ${s.posY}%`,
    transform: `scale(${s.zoom})`,
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <ImageUpload label="Твоята снимка" value={s.image} onChange={(image) => set({ image })} maxSide={1200} />

          <div>
            <label htmlFor="ph-size" className="field-label">Размер за документ</label>
            <select id="ph-size" className="field-input" value={s.size}
              onChange={(e) => set({ size: e.target.value as PhotoState["size"] })}>
              {(Object.keys(SIZES) as PhotoState["size"][]).map((k) => (
                <option key={k} value={k}>{SIZES[k].name}</option>
              ))}
            </select>
          </div>

          {s.image && (
            <>
              {/* Кроп визьор с водач за лицето */}
              <div>
                <span className="field-label">Нагласи лицето в рамката</span>
                <div className="mx-auto overflow-hidden rounded-lg border border-ink/20 bg-white" style={{ width: 180, height: 180 * size.h / size.w, position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt="" style={imgStyle} />
                  {s.guide && (
                    <div aria-hidden style={{
                      position: "absolute", left: "50%", top: "48%", transform: "translate(-50%, -50%)",
                      width: "58%", height: "72%", border: "2px dashed rgba(0,0,0,0.35)", borderRadius: "50%",
                      pointerEvents: "none",
                    }} />
                  )}
                </div>
              </div>
              <label className="block text-xs font-semibold text-ink-soft">
                <span className="flex items-baseline justify-between"><span>Мащаб</span><span className="tabular-nums text-ink-faint">{s.zoom.toFixed(2)}×</span></span>
                <input type="range" min={1} max={3} step={0.05} value={s.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} className="mt-1 h-4 w-full accent-tera" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-ink-soft">
                  Хоризонтално
                  <input type="range" min={0} max={100} step={1} value={s.posX} onChange={(e) => set({ posX: Number(e.target.value) })} className="mt-1 h-4 w-full accent-tera" />
                </label>
                <label className="block text-xs font-semibold text-ink-soft">
                  Вертикално
                  <input type="range" min={0} max={100} step={1} value={s.posY} onChange={(e) => set({ posY: Number(e.target.value) })} className="mt-1 h-4 w-full accent-tera" />
                </label>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                  <input type="checkbox" checked={s.guide} onChange={(e) => set({ guide: e.target.checked })} className="h-4 w-4 accent-tera" />
                  Водач за лицето (не се печата)
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                  <input type="checkbox" checked={s.frame} onChange={(e) => set({ frame: e.target.checked })} className="h-4 w-4 accent-tera" />
                  Тънка рамка за рязане
                </label>
              </div>
              <div>
                <label htmlFor="ph-count" className="field-label">Брой снимки на лист</label>
                <input id="ph-count" type="number" min={1} max={perSheet} className="field-input" value={s.count}
                  onChange={(e) => set({ count: Math.max(1, Math.min(perSheet, Number(e.target.value) || 1)) })} />
                <p className="mt-1 text-xs text-ink-faint">На този размер се събират до {perSheet} снимки на лист А4.</p>
              </div>
            </>
          )}

          <p className="text-xs text-ink-faint">
            Снимката се обработва изцяло в браузъра ти — нищо не се качва. Провери
            конкретните изисквания на документа (размер на лицето, фон, изражение)
            преди печат.
          </p>
        </div>
        <ProjectFile state={s} filename="mastilko-photo"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={s.image ? `${total} снимки ${size.w}×${size.h} mm на лист А4` : "Качи снимка, за да започнеш"} />
        <SheetPreview>
          {s.image && Array.from({ length: total }).map((_, i) => {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const left = grid.offsetX + col * (size.w + grid.gapX);
            const top = grid.offsetY + row * (size.h + grid.gapY);
            return (
              <div key={i} style={{
                position: "absolute", left: `${left}mm`, top: `${top}mm`,
                width: `${size.w}mm`, height: `${size.h}mm`, overflow: "hidden",
                border: s.frame ? "0.2mm solid rgba(120,110,100,0.5)" : "none",
                background: "#fff",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt="" style={imgStyle} />
              </div>
            );
          })}
        </SheetPreview>
      </div>
    </div>
  );
}
