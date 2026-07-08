"use client";

import { z } from "zod";
import { themeById } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import ThemePicker from "@/components/ThemePicker";

interface TabelkaState {
  emoji: string;
  title: string;
  subtitle: string;
  landscape: boolean;
  themeId: string;
}

const INITIAL: TabelkaState = {
  emoji: "🔔",
  title: "МОЛЯ, ЗВЪННЕТЕ",
  subtitle: "Заповядайте — ей сега идваме",
  landscape: false,
  themeId: "tera",
};

const ProjectSchema = z
  .object({
    emoji: z.string().max(8),
    title: z.string().max(60),
    subtitle: z.string().max(120),
    landscape: z.boolean(),
    themeId: z.string().max(20),
  })
  .partial();

const PRESETS: Array<{ label: string; v: Partial<TabelkaState> }> = [
  { label: "Отворено", v: { emoji: "✅", title: "ОТВОРЕНО", subtitle: "Заповядайте!", themeId: "gora" } },
  { label: "Затворено", v: { emoji: "⛔", title: "ЗАТВОРЕНО", subtitle: "Ще се върнем скоро", themeId: "tera" } },
  { label: "Работно време", v: { emoji: "🕐", title: "РАБОТНО ВРЕМЕ", subtitle: "Пон–Пет: 9:00–18:00\nСъб: 9:00–13:00", themeId: "nebe" } },
  { label: "Пази се от кучето", v: { emoji: "🐕", title: "ПАЗИ СЕ ОТ КУЧЕТО", subtitle: "", themeId: "med" } },
  { label: "Не пуши", v: { emoji: "🚭", title: "ПУШЕНЕТО ЗАБРАНЕНО", subtitle: "Благодарим за разбирането", themeId: "tera" } },
  { label: "Звънец", v: { emoji: "🔔", title: "МОЛЯ, ЗВЪННЕТЕ", subtitle: "Ей сега идваме", themeId: "med" } },
];

export default function TabelkaStudio() {
  const [s, setS] = useLocalState<TabelkaState>("mastilko-tabelka", INITIAL);
  const theme = themeById(s.themeId);
  const set = (patch: Partial<TabelkaState>) => setS({ ...s, ...patch });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-3 p-5">
          <span className="field-label">Готови табелки</span>
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
          <div>
            <label htmlFor="t-emoji" className="field-label">Икона (емоджи)</label>
            <input id="t-emoji" className="field-input" maxLength={8} value={s.emoji}
              onChange={(e) => set({ emoji: e.target.value })} placeholder="напр. 🔔" />
          </div>
          <div>
            <label htmlFor="t-title" className="field-label">Голям текст</label>
            <input id="t-title" className="field-input" maxLength={60} value={s.title}
              onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="t-sub" className="field-label">Малък текст (нов ред с Enter)</label>
            <textarea id="t-sub" className="field-input min-h-20" maxLength={120} value={s.subtitle}
              onChange={(e) => set({ subtitle: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={s.landscape}
              onChange={(e) => set({ landscape: e.target.checked })} className="h-4 w-4 accent-tera" />
            Хоризонтално (пейзаж)
          </label>
          <div>
            <span className="field-label">Цвят</span>
            <ThemePicker value={s.themeId} onChange={(id) => set({ themeId: id })} />
          </div>
        </div>
        <ProjectFile state={s} filename="mastilko-tabelka"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={`Табелка на ${s.landscape ? "хоризонтален" : "вертикален"} лист А4`} />
        <SheetPreview landscape={s.landscape}>
          <div style={{
            position: "absolute", inset: 0, background: theme.bg, color: theme.fg,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", textAlign: "center", padding: "20mm",
            border: `4mm solid ${theme.accent}`,
          }}>
            {s.emoji && <div style={{ fontSize: "60mm", lineHeight: 1 }}>{s.emoji}</div>}
            <div style={{
              fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: s.title.length > 20 ? "18mm" : "26mm", lineHeight: 1.05,
              marginTop: "8mm",
            }}>
              {s.title}
            </div>
            {s.subtitle && (
              <div style={{ fontSize: "9mm", marginTop: "8mm", lineHeight: 1.3, whiteSpace: "pre-line" }}>
                {s.subtitle}
              </div>
            )}
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
