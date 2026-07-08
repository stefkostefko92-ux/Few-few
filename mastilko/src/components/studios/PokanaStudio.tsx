"use client";

import { z } from "zod";
import { type WarmTheme } from "@/lib/themes";
import { resolveTheme, fontVars, elementFont, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import BackgroundDecor from "@/components/BackgroundDecor";
import FontPicker from "@/components/FontPicker";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

interface PokanaState extends StyleState {
  emoji: string;
  heading: string;
  who: string;
  what: string;
  date: string;
  time: string;
  place: string;
  note: string;
  themeId: string;
  copies: 1 | 2;
}

const INITIAL: PokanaState = {
  emoji: "🎉",
  heading: "Каним те на рожден ден!",
  who: "Мартин става на 7 години",
  what: "",
  date: "15 юни 2026 г.",
  time: "16:00 ч.",
  place: "Детски център „Веселка“, Бобов дол",
  note: "Очакваме те за игри, торта и много изненади!",
  themeId: "med",
  copies: 2,
};

const ProjectSchema = z
  .object({
    emoji: z.string().max(8),
    heading: z.string().max(80),
    who: z.string().max(80),
    what: z.string().max(80),
    date: z.string().max(60),
    time: z.string().max(40),
    place: z.string().max(120),
    note: z.string().max(200),
    copies: z.union([z.literal(1), z.literal(2)]),
    ...StyleSchemaShape,
  })
  .partial();

const PRESETS: Array<{ label: string; v: Partial<PokanaState> }> = [
  { label: "Рожден ден", v: { emoji: "🎉", heading: "Каним те на рожден ден!", themeId: "med" } },
  { label: "Кръщене", v: { emoji: "👶", heading: "Каним те на кръщене", themeId: "nebe" } },
  { label: "Сватба", v: { emoji: "💍", heading: "Каним те на сватбата ни", themeId: "tera" } },
  { label: "Юбилей", v: { emoji: "🥂", heading: "Каним те на юбилей", themeId: "gora" } },
];

function Card({ s, theme, u }: { s: PokanaState; theme: WarmTheme; u: (v: number) => string }) {
  return (
    <div style={{
      position: "relative",
      width: u(200), height: u(138), background: theme.bg, color: theme.fg,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: `${u(8)} ${u(14)}`,
      border: `${u(1)} solid ${theme.accent}`, borderRadius: u(3), overflow: "hidden",
    }}>
      <BackgroundDecor decor={s.decor} color={theme.accent} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {s.emoji && <div style={{ fontSize: u(16), lineHeight: 1 }}>{s.emoji}</div>}
        <div style={{ fontFamily: elementFont(s, "heading", "var(--font-display)"), fontWeight: 800, fontSize: u(8), marginTop: u(2), color: theme.accent }}>
          {s.heading}
        </div>
        {s.who && <div style={{ fontFamily: elementFont(s, "who", "var(--font-sans)"), fontSize: u(5.5), fontWeight: 700, marginTop: u(2) }}>{s.who}</div>}
        <div style={{ fontSize: u(4.2), marginTop: u(3), lineHeight: 1.5 }}>
          {[s.date, s.time].filter(Boolean).join(" · ")}
          {s.place && <div>{s.place}</div>}
        </div>
        {s.note && <div style={{ fontFamily: elementFont(s, "note", "var(--font-sans)"), fontSize: u(3.8), marginTop: u(3), fontStyle: "italic", opacity: 0.85 }}>{s.note}</div>}
      </div>
    </div>
  );
}

export default function PokanaStudio() {
  const [s, setS] = useLocalState<PokanaState>("mastilko-pokana", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<PokanaState>) => setS({ ...s, ...patch });
  const mm = (v: number) => `${v}mm`;
  const px = (v: number) => `${v * 3.1}px`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-3 p-5">
          <span className="field-label">Повод</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => set(p.v)}
                className="rounded-full border-2 border-ink/10 px-3 py-1 text-sm font-semibold hover:border-tera-dark">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-warm space-y-4 p-5">
          {([
            ["emoji", "Икона (емоджи)", "🎉"],
            ["heading", "Заглавие", "Каним те на…"],
            ["who", "Кой / повод", "напр. Мартин става на 7"],
            ["date", "Дата", "15 юни 2026 г."],
            ["time", "Час", "16:00 ч."],
            ["place", "Място", "адрес"],
            ["note", "Съобщение", "кратко послание"],
          ] as const).map(([k, label, ph]) => (
            <div key={k}>
              <label htmlFor={`p-${k}`} className="field-label">{label}</label>
              <input id={`p-${k}`} className="field-input" maxLength={200} value={s[k]}
                onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            Брой на лист:
            <select className="field-input !w-20" value={s.copies}
              onChange={(e) => set({ copies: Number(e.target.value) === 1 ? 1 : 2 })}>
              <option value={2}>2</option>
              <option value={1}>1</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FontPicker label="Шрифт: заглавие" value={s.fonts?.heading} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, heading: id } })} />
            <FontPicker label="Шрифт: повод" value={s.fonts?.who} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, who: id } })} />
          </div>
          <StyleControls value={s} onChange={set} />
        </div>
        <ProjectFile state={s} filename="mastilko-pokana"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <div className="no-print card-warm p-5">
          <p className="field-label">Преглед отблизо</p>
          <div className="overflow-x-auto">
            <div className="w-fit shadow-lift" style={{ borderRadius: 8 }}>
              <Card s={s} theme={theme} u={px} />
            </div>
          </div>
        </div>
        <PrintBar summary={`${s.copies} покани на лист А4`} />
        <SheetPreview style={fontVars(s)}>
          {Array.from({ length: s.copies }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: "5mm", top: `${8 + i * 145}mm` }}>
              <Card s={s} theme={theme} u={mm} />
            </div>
          ))}
        </SheetPreview>
      </div>
    </div>
  );
}
