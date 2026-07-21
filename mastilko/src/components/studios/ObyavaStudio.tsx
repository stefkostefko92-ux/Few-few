"use client";

import { z } from "zod";
import { resolveTheme, fontVars, elementFont, sheetBg, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import BackgroundDecor from "@/components/BackgroundDecor";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); mm математиката не се влияе.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface ObyavaState extends StyleState {
  title: string;
  body: string;
  contact: string;
  tabs: number;
  image: string;
  themeId: string;
}

const INITIAL: ObyavaState = {
  title: "Давам уроци по математика",
  body: "5.–12. клас · подготовка за НВО и матура · на място или онлайн · първи час безплатен.",
  contact: "☎ 0888 123 456",
  tabs: 10,
  image: "",
  themeId: "gora",
};

const ProjectSchema = z
  .object({
    title: z.string().max(120),
    body: z.string().max(600),
    contact: z.string().max(40),
    tabs: z.number().int().min(6).max(14),
    image: z.string().max(500000),
    ...StyleSchemaShape,
  })
  .partial();

export default function ObyavaStudio() {
  const [s, setS] = useLocalState<ObyavaState>("mastilko-obyava", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<ObyavaState>) => setS({ ...s, ...patch });

  const tabW = 210 / s.tabs;
  const fringeH = 78;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="o-title" className="field-label">Заглавие</label>
            <input id="o-title" className="field-input" maxLength={120} value={s.title}
              onChange={(e) => set({ title: e.target.value })} placeholder="напр. Давам уроци по математика" />
          </div>
          <div>
            <label htmlFor="o-body" className="field-label">Текст</label>
            <textarea id="o-body" className="field-input min-h-28" maxLength={600} value={s.body}
              onChange={(e) => set({ body: e.target.value })} />
          </div>
          <div>
            <label htmlFor="o-contact" className="field-label">Телефон/контакт (на всяка ресна)</label>
            <input id="o-contact" className="field-input" maxLength={40} value={s.contact}
              onChange={(e) => set({ contact: e.target.value })} placeholder="☎ 0888 123 456" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            Брой ресни:
            <select className="field-input !w-24" value={s.tabs}
              onChange={(e) => set({ tabs: Number(e.target.value) })}>
              {[6, 8, 10, 12, 14].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <ImageUpload label="Снимка (по избор)" value={s.image} onChange={(image) => set({ image })} />
          <StyleControls value={s} onChange={set} />
        </div>
        <ProjectFile state={s} filename="mastilko-obyava"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={`Обява с ${s.tabs} откъсващи се телефона на лист А4`} />
        <SheetPreview style={fontVars(s)}>
          <div style={{
            position: "absolute", inset: 0, background: sheetBg(s, theme), color: theme.fg,
            display: "flex", flexDirection: "column",
          }}>
            <BackgroundDecor decor={s.decor} color={theme.accent} />
            {/* Горна част: заглавие + текст + снимка */}
            <div style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", textAlign: "center", padding: "18mm 16mm", gap: "6mm",
              position: "relative", zIndex: 1,
            }}>
              <div style={{ fontFamily: elementFont(s, "title", "var(--font-display)"), fontWeight: 800, fontSize: fs(14), lineHeight: 1.1, color: theme.accent }}>
                {s.title}
              </div>
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" style={{ maxWidth: "70%", maxHeight: "70mm", objectFit: "contain", borderRadius: "2mm" }} />
              )}
              <div style={{ fontSize: fs(5.5), lineHeight: 1.5, maxWidth: "85%", whiteSpace: "pre-line" }}>
                {s.body}
              </div>
              <div style={{ fontSize: fs(6), fontWeight: 700, marginTop: "2mm" }}>{s.contact}</div>
            </div>
            {/* Долна лента с откъсващи се телефончета */}
            <div style={{
              height: `${fringeH}mm`, display: "flex", position: "relative", zIndex: 1,
              borderTop: `0.3mm dashed ${theme.accent}`,
            }}>
              {Array.from({ length: s.tabs }).map((_, i) => (
                <div key={i} style={{
                  width: `${tabW}mm`, height: "100%", position: "relative",
                  borderLeft: i === 0 ? "none" : "0.3mm dashed rgba(120,110,100,0.6)",
                }}>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%) rotate(-90deg)",
                    transformOrigin: "center", whiteSpace: "nowrap",
                    fontSize: fs(3.6), fontWeight: 700,
                  }}>
                    {s.contact}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
