"use client";

import { z } from "zod";
import { resolveTheme, fontVars, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

interface GramotaState extends StyleState {
  kind: string;
  recipient: string;
  reason: string;
  org: string;
  place: string;
  date: string;
  signer: string;
  themeId: string;
}

const INITIAL: GramotaState = {
  kind: "ГРАМОТА",
  recipient: "",
  reason: "за отличен успех и примерно поведение през учебната 2025/2026 година",
  org: "ОУ „Христо Ботев“",
  place: "Бобов дол",
  date: "31 май 2026 г.",
  signer: "Директор",
  themeId: "med",
};

const ProjectSchema = z
  .object({
    kind: z.string().max(40),
    recipient: z.string().max(80),
    reason: z.string().max(400),
    org: z.string().max(80),
    place: z.string().max(60),
    date: z.string().max(60),
    signer: z.string().max(60),
    ...StyleSchemaShape,
  })
  .partial();

const KINDS = ["ГРАМОТА", "СЕРТИФИКАТ", "ДИПЛОМА", "БЛАГОДАРСТВЕНО ПИСМО"];

export default function GramotaStudio() {
  const [s, setS] = useLocalState<GramotaState>("mastilko-gramota", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<GramotaState>) => setS({ ...s, ...patch });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="kind" className="field-label">Вид</label>
            <select id="kind" className="field-input" value={s.kind}
              onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="recipient" className="field-label">Награждава се</label>
            <input id="recipient" className="field-input" maxLength={80} value={s.recipient}
              onChange={(e) => set({ recipient: e.target.value })} placeholder="Име Фамилия" />
          </div>
          <div>
            <label htmlFor="reason" className="field-label">За какво</label>
            <textarea id="reason" className="field-input min-h-20" maxLength={400} value={s.reason}
              onChange={(e) => set({ reason: e.target.value })} />
          </div>
          {([
            ["org", "Организация", "напр. ОУ „Христо Ботев“"],
            ["place", "Място", "напр. Бобов дол"],
            ["date", "Дата", "напр. 31 май 2026 г."],
            ["signer", "Подпис (длъжност)", "напр. Директор"],
          ] as const).map(([k, label, ph]) => (
            <div key={k}>
              <label htmlFor={`g-${k}`} className="field-label">{label}</label>
              <input id={`g-${k}`} className="field-input" maxLength={80} value={s[k]}
                onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
            </div>
          ))}
          <StyleControls value={s} onChange={set} />
        </div>
        <ProjectFile state={s} filename="mastilko-gramota"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary="Грамота на хоризонтален лист А4" />
        <SheetPreview landscape style={fontVars(s)}>
          <div style={{
            position: "absolute", inset: 0, padding: "10mm",
            display: "flex", flexDirection: "column",
          }}>
            {/* Двойна орнаментна рамка */}
            <div style={{
              flex: 1, border: `2mm solid ${theme.accent}`,
              padding: "4mm", position: "relative",
            }}>
              <div style={{
                height: "100%", border: `0.5mm solid ${theme.accent}`,
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", textAlign: "center", padding: "10mm 18mm",
                color: theme.fg, background: theme.bg,
              }}>
                <div style={{ fontSize: "5mm", letterSpacing: "0.3em", color: theme.accent, fontWeight: 700 }}>
                  {s.org || " "}
                </div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 800,
                  fontSize: "16mm", letterSpacing: "0.05em", marginTop: "4mm",
                  color: theme.accent,
                }}>
                  {s.kind}
                </div>
                <div style={{ fontSize: "4mm", marginTop: "6mm" }}>връчва се на</div>
                <div style={{
                  fontFamily: "var(--font-display)", fontWeight: 800,
                  fontSize: "11mm", margin: "3mm 0", borderBottom: `0.4mm solid ${theme.accent}`,
                  paddingBottom: "2mm", minWidth: "60%",
                }}>
                  {s.recipient || "Име Фамилия"}
                </div>
                <div style={{ fontSize: "4.2mm", lineHeight: 1.5, maxWidth: "80%", marginTop: "3mm" }}>
                  {s.reason}
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", width: "100%",
                  marginTop: "auto", paddingTop: "12mm", fontSize: "3.6mm",
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: `0.3mm solid ${theme.fg}`, paddingTop: "1.5mm", minWidth: "45mm" }}>
                      {s.place}{s.place && s.date ? ", " : ""}{s.date}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: `0.3mm solid ${theme.fg}`, paddingTop: "1.5mm", minWidth: "45mm" }}>
                      {s.signer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
