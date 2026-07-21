"use client";

import { z } from "zod";
import { type WarmTheme } from "@/lib/themes";
import { resolveTheme, fontVars, elementFont, resolveDecor, sheetBg, borderWith, titleFx, StyleSchemaShape, type StyleState } from "@/lib/style";
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
  /** Серия: по едно име на ред → покана за всеки (2 на лист). „{име}“ в
   *  заглавието се заменя с името. Празно = обикновен режим. */
  series: string;
  /** Централна линия за сгъване (сгъната картичка). */
  foldLine: boolean;
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
  series: "",
  foldLine: false,
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
    series: z.string().max(4000),
    foldLine: z.boolean(),
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
  // Размер на текста с глобален мащаб — само шрифтът, не оформлението.
  const fu = (v: number) => `calc(var(--sheet-scale, 1) * ${u(v)})`;
  return (
    <div style={{
      position: "relative",
      width: u(200), height: u(138), background: sheetBg(s, theme), color: theme.fg,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: `${u(8)} ${u(14)}`,
      ...borderWith(s, { width: 1, style: "solid", color: theme.accent, radius: 3 }, u), overflow: "hidden",
    }}>
      <BackgroundDecor decor={s.decor} {...resolveDecor(s, theme.accent)} />
      {s.foldLine && (
        <div aria-hidden style={{
          position: "absolute", left: 0, right: 0, top: "50%",
          borderTop: "0.3mm dashed rgba(0,0,0,0.4)", zIndex: 3,
        }} />
      )}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {s.emoji && <div style={{ fontSize: fu(16), lineHeight: 1 }}>{s.emoji}</div>}
        <div style={{ fontFamily: elementFont(s, "heading", "var(--font-display)"), fontWeight: 800, fontSize: fu(8), marginTop: u(2), color: theme.accent, ...titleFx(s, theme) }}>
          {s.heading}
        </div>
        {s.who && <div style={{ fontFamily: elementFont(s, "who", "var(--font-sans)"), fontSize: fu(5.5), fontWeight: 700, marginTop: u(2) }}>{s.who}</div>}
        <div style={{ fontSize: fu(4.2), marginTop: u(3), lineHeight: 1.5 }}>
          {[s.date, s.time].filter(Boolean).join(" · ")}
          {s.place && <div>{s.place}</div>}
        </div>
        {s.note && <div style={{ fontFamily: elementFont(s, "note", "var(--font-sans)"), fontSize: fu(3.8), marginTop: u(3), fontStyle: "italic", opacity: 0.85 }}>{s.note}</div>}
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
  const names = s.series.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
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
          <div>
            <label htmlFor="p-series" className="field-label">
              Серия — по едно име на ред (покана за всеки гост)
            </label>
            <textarea id="p-series" className="field-input min-h-20" maxLength={4000} value={s.series}
              onChange={(e) => set({ series: e.target.value })}
              placeholder={"Иван\nМария\nсем. Петрови"} />
            <p className="mt-1 text-xs text-ink-faint">
              {names.length > 0
                ? `Ще се отпечатат ${names.length} покани (2 на лист). Можеш да ползваш „{име}“ в заглавието; „Кой / повод“ се заменя с името.`
                : "Остави празно за обикновена покана. Всеки ред става отделна покана."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            Брой на лист:
            <select className="field-input !w-20" value={s.copies}
              onChange={(e) => set({ copies: Number(e.target.value) === 1 ? 1 : 2 })}>
              <option value={2}>2</option>
              <option value={1}>1</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={s.foldLine}
              onChange={(e) => set({ foldLine: e.target.checked })} className="h-4 w-4 accent-tera" />
            Линия за сгъване (сгъната картичка)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <FontPicker label="Шрифт: заглавие" value={s.fonts?.heading} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, heading: id } })} />
            <FontPicker label="Шрифт: повод" value={s.fonts?.who} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, who: id } })} />
          </div>
          <StyleControls value={s} onChange={set} showTitleFx />
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
        <PrintBar summary={names.length > 0
          ? `Серия: ${names.length} покани (2 на лист А4)`
          : `${s.copies} покани на лист А4`} />
        {names.length > 0 ? (
          chunkPairs(names).map((pair, si) => (
            <SheetPreview key={si} style={fontVars(s)}>
              {pair.map((name, j) => (
                <div key={j} style={{ position: "absolute", left: "5mm", top: `${8 + j * 145}mm` }}>
                  <Card
                    s={{ ...s, who: name, heading: s.heading.replace(/\{име\}/g, name) }}
                    theme={theme}
                    u={mm}
                  />
                </div>
              ))}
            </SheetPreview>
          ))
        ) : (
          <SheetPreview style={fontVars(s)}>
            {Array.from({ length: s.copies }).map((_, i) => (
              <div key={i} style={{ position: "absolute", left: "5mm", top: `${8 + i * 145}mm` }}>
                <Card s={s} theme={theme} u={mm} />
              </div>
            ))}
          </SheetPreview>
        )}
      </div>
    </div>
  );
}

/** Разбива списък на двойки (по 2 покани на лист). */
function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}
