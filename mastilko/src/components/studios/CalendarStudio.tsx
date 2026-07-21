"use client";

import { z } from "zod";
import { resolveTheme, fontVars, sheetBg, StyleSchemaShape, type StyleState } from "@/lib/style";
import { bgHolidays } from "@/lib/bg-holidays";
import { useLocalState } from "@/lib/use-local-state";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

const MONTHS = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

interface CalState extends StyleState {
  year: number;
  month: number;
  showHolidays: boolean;
  themeId: string;
}

const INITIAL: CalState = {
  year: 2026,
  month: 0,
  showHolidays: true,
  themeId: "nebe",
};

const ProjectSchema = z
  .object({
    year: z.number().int().min(2020).max(2099),
    month: z.number().int().min(0).max(11),
    showHolidays: z.boolean(),
    ...StyleSchemaShape,
  })
  .partial();

export default function CalendarStudio() {
  const [s, setS] = useLocalState<CalState>("mastilko-calendar", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<CalState>) => setS({ ...s, ...patch });

  const holidays = s.showHolidays ? bgHolidays(s.year) : {};
  const first = new Date(Date.UTC(s.year, s.month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // понеделник = 0
  const daysInMonth = new Date(Date.UTC(s.year, s.month + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="c-month" className="field-label">Месец</label>
              <select id="c-month" className="field-input" value={s.month}
                onChange={(e) => set({ month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="c-year" className="field-label">Година</label>
              <input id="c-year" type="number" min={2020} max={2099} className="field-input" value={s.year}
                onChange={(e) => set({ year: Math.max(2020, Math.min(2099, Number(e.target.value) || 2026)) })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={s.showHolidays}
              onChange={(e) => set({ showHolidays: e.target.checked })} className="h-4 w-4 accent-tera" />
            Отбелязвай официалните празници
          </label>
          <StyleControls value={s} onChange={set} hideBorder />
        </div>
        <ProjectFile state={s} filename="mastilko-calendar"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={`Календар ${MONTHS[s.month]} ${s.year} на лист А4`} />
        <SheetPreview style={fontVars(s)}>
          <div style={{
            position: "absolute", inset: 0, background: sheetBg(s, theme), color: theme.fg,
            display: "flex", flexDirection: "column", padding: "14mm 12mm",
          }}>
            <div style={{ textAlign: "center", marginBottom: "8mm" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs(16), color: theme.accent }}>
                {MONTHS[s.month]}
              </div>
              <div style={{ fontSize: fs(6), letterSpacing: "0.2em", opacity: 0.8 }}>{s.year}</div>
            </div>
            {/* Дни от седмицата */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1mm", marginBottom: "1.5mm" }}>
              {WD.map((w, i) => (
                <div key={w} style={{ textAlign: "center", fontWeight: 700, fontSize: fs(3.6), color: i >= 5 ? theme.accent : theme.fg, opacity: i >= 5 ? 1 : 0.8 }}>
                  {w}
                </div>
              ))}
            </div>
            {/* Мрежа с дните */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "1fr", gap: "1mm" }}>
              {cells.map((d, i) => {
                const weekend = i % 7 >= 5;
                const hol = d !== null ? holidays[`${s.month + 1}-${d}`] : undefined;
                return (
                  <div key={i} style={{
                    border: "0.2mm solid rgba(120,110,100,0.25)", borderRadius: "1mm",
                    padding: "1.5mm", position: "relative", overflow: "hidden",
                    background: hol ? theme.accent : weekend ? "rgba(0,0,0,0.04)" : "transparent",
                    color: hol ? theme.bg : theme.fg,
                  }}>
                    {d !== null && (
                      <>
                        <div style={{ fontWeight: 700, fontSize: fs(4) }}>{d}</div>
                        {hol && <div style={{ fontSize: fs(2.2), lineHeight: 1.1, marginTop: "0.5mm" }}>{hol}</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
