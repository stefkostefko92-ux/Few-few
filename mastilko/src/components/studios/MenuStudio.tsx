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

const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface MenuState extends StyleState {
  title: string;
  subtitle: string;
  body: string;
  currency: string;
  logo: string;
  themeId: string;
}

const INITIAL: MenuState = {
  title: "Кафе „Мечта“",
  subtitle: "Меню",
  body:
    "## Кафе\nЕспресо | 2.00\nКапучино | 2.80\nЛате | 3.20\n\n## Напитки\nЛимонада | 4.00\nФреш портокал | 4.50\n\n## Сладко\nПалачинка | 5.00\nЧийзкейк | 4.80",
  currency: "лв.",
  logo: "",
  themeId: "med",
};

const ProjectSchema = z
  .object({
    title: z.string().max(60),
    subtitle: z.string().max(60),
    body: z.string().max(4000),
    currency: z.string().max(6),
    logo: z.string().max(500000),
    ...StyleSchemaShape,
  })
  .partial();

interface Section { heading: string; items: Array<{ name: string; price: string }> }

function parseMenu(body: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      cur = { heading: line.replace(/^#+/, "").trim(), items: [] };
      sections.push(cur);
    } else {
      const [name, price] = line.split("|").map((x) => x.trim());
      if (!cur) {
        cur = { heading: "", items: [] };
        sections.push(cur);
      }
      cur.items.push({ name: name ?? line, price: price ?? "" });
    }
  }
  return sections;
}

export default function MenuStudio() {
  const [s, setS] = useLocalState<MenuState>("mastilko-menu", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<MenuState>) => setS({ ...s, ...patch });
  const sections = parseMenu(s.body);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="m-title" className="field-label">Име на заведението</label>
            <input id="m-title" className="field-input" maxLength={60} value={s.title}
              onChange={(e) => set({ title: e.target.value })} placeholder="напр. Кафе „Мечта“" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="m-sub" className="field-label">Подзаглавие</label>
              <input id="m-sub" className="field-input" maxLength={60} value={s.subtitle}
                onChange={(e) => set({ subtitle: e.target.value })} placeholder="Меню" />
            </div>
            <div>
              <label htmlFor="m-cur" className="field-label">Валута</label>
              <input id="m-cur" className="field-input" maxLength={6} value={s.currency}
                onChange={(e) => set({ currency: e.target.value })} placeholder="лв." />
            </div>
          </div>
          <div>
            <label htmlFor="m-body" className="field-label">
              Съдържание — раздел с „## Име“, продукт с „Име | цена“
            </label>
            <textarea id="m-body" className="field-input min-h-64 font-mono text-sm" maxLength={4000} value={s.body}
              onChange={(e) => set({ body: e.target.value })} />
            <p className="mt-1 text-xs text-ink-faint">
              Пример: „## Кафе“ на нов ред за раздел, после „Еспресо | 2.00“ за продукт.
            </p>
          </div>
          <ImageUpload label="Лого (по избор)" value={s.logo} onChange={(logo) => set({ logo })} />
          <StyleControls value={s} onChange={set} />
        </div>
        <ProjectFile state={s} filename="mastilko-menu"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary="Меню / ценоразпис на лист А4" />
        <SheetPreview fixedHeight={false} style={fontVars(s)}>
          <div style={{
            position: "absolute", inset: 0, minHeight: "297mm", background: sheetBg(s, theme), color: theme.fg,
            padding: "18mm 16mm", display: "flex", flexDirection: "column",
          }}>
            <BackgroundDecor decor={s.decor} color={theme.accent} />
            <div style={{ textAlign: "center", marginBottom: "8mm", position: "relative", zIndex: 1 }}>
              {s.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo} alt="" style={{ height: "18mm", maxWidth: "60mm", objectFit: "contain", margin: "0 auto 3mm" }} />
              )}
              <div style={{ fontFamily: elementFont(s, "title", "var(--font-display)"), fontWeight: 800, fontSize: fs(12), color: theme.accent }}>
                {s.title}
              </div>
              {s.subtitle && <div style={{ fontSize: fs(5), letterSpacing: "0.25em", opacity: 0.8, marginTop: "1mm" }}>{s.subtitle}</div>}
            </div>
            <div style={{ position: "relative", zIndex: 1 }}>
              {sections.map((sec, si) => (
                <div key={si} style={{ marginBottom: "6mm", breakInside: "avoid" }}>
                  {sec.heading && (
                    <div style={{
                      fontFamily: elementFont(s, "heading", "var(--font-display)"), fontWeight: 800,
                      fontSize: fs(6), color: theme.accent, borderBottom: `0.4mm solid ${theme.accent}`,
                      paddingBottom: "1.5mm", marginBottom: "3mm",
                    }}>
                      {sec.heading}
                    </div>
                  )}
                  {sec.items.map((it, ii) => (
                    <div key={ii} style={{ display: "flex", alignItems: "baseline", gap: "2mm", marginBottom: "2mm", fontSize: fs(4.2) }}>
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{it.name}</span>
                      <span style={{ flex: 1, borderBottom: "0.2mm dotted rgba(120,110,100,0.6)", transform: "translateY(-1mm)" }} />
                      {it.price && <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{it.price} {s.currency}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
