"use client";

import { z } from "zod";
import { resolveTheme, fontVars, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import Icon from "@/components/Icon";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); печатната математика в mm
// не се влияе — само размерите на шрифта се умножават.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface PismoState extends StyleState {
  name: string;
  phone: string;
  email: string;
  city: string;
  date: string;
  company: string;
  position: string;
  recipient: string;
  /** Кратко „защо аз“ — суровина за AI черновата. */
  strengths: string;
  body: string;
  themeId: string;
  /** Поле (margin) на страницата в mm. */
  margin: number;
  /** Цветна лента-бланка с името горе. */
  letterhead: boolean;
}

// Валидация на качен проект-файл (виж бележката в LabelStudio).
const ProjectSchema = z
  .object({
    name: z.string().max(100),
    phone: z.string().max(100),
    email: z.string().max(100),
    city: z.string().max(100),
    date: z.string().max(100),
    company: z.string().max(100),
    position: z.string().max(100),
    recipient: z.string().max(100),
    strengths: z.string().max(600),
    body: z.string().max(4000),
    margin: z.number().min(12).max(30),
    letterhead: z.boolean(),
    ...StyleSchemaShape,
  })
  .partial();

/** „г-жа Мария…“ → „Уважаема г-жо Мария…,“; „г-н…“ → „Уважаеми г-н…,“. */
function greeting(recipient: string): string {
  const r = recipient.split(",")[0]!.trim();
  if (!r) return "Уважаеми дами и господа,";
  if (/^г-жа\s/i.test(r)) return `Уважаема ${r.replace(/^г-жа/i, "г-жо")},`;
  return `Уважаеми ${r},`;
}

const INITIAL: PismoState = {
  name: "",
  phone: "",
  email: "",
  city: "",
  date: "",
  company: "",
  position: "",
  recipient: "",
  strengths: "",
  body: "",
  themeId: "tera",
  margin: 20,
  letterhead: false,
};

export default function PismoStudio() {
  const [s, setS] = useLocalState<PismoState>("mastilko-pismo", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<PismoState>) => setS({ ...s, ...patch });

  const aiInput = [
    s.position && `позиция: ${s.position}`,
    s.company && `фирма: ${s.company}`,
    s.strengths && `за мен: ${s.strengths}`,
  ]
    .filter(Boolean)
    .join("; ");

  const paragraphs = s.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const contact = [s.phone, s.email].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      {/* Контроли */}
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          {(
            [
              ["name", "Име и фамилия", "напр. Иван Петров"],
              ["phone", "Телефон", "+359 …"],
              ["email", "Имейл", "ivan@primer.bg"],
              ["city", "Град", "напр. София"],
              ["date", "Дата", "напр. 7 юли 2026 г."],
              ["company", "Фирма / организация", "напр. „Мечта“ ЕООД"],
              ["position", "Позиция, за която кандидатстваш", "напр. Графичен дизайнер"],
              ["recipient", "До (по желание)", "напр. г-жа Мария Иванова, HR мениджър"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`pismo-${key}`} className="field-label">{label}</label>
              <input
                id={`pismo-${key}`}
                className="field-input"
                maxLength={100}
                value={s[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
          <StyleControls value={s} onChange={set} hideDecor hideBorder />

          <div className="space-y-3 border-t border-ink/10 pt-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input type="checkbox" checked={s.letterhead}
                onChange={(e) => set({ letterhead: e.target.checked })} className="h-4 w-4 accent-tera" />
              Цветна бланка с името
            </label>
            <label className="block text-xs font-semibold text-ink-soft">
              <span className="flex items-baseline justify-between">
                <span>Поле на страницата</span>
                <span className="tabular-nums text-ink-faint">{s.margin} mm</span>
              </span>
              <input type="range" min={12} max={30} step={1} value={s.margin}
                onChange={(e) => set({ margin: Number(e.target.value) })}
                className="mt-1 h-4 w-full accent-tera" aria-label="Поле на страницата" />
            </label>
          </div>
        </div>

        <div className="card-warm space-y-3 p-5">
          <div>
            <label htmlFor="pismo-strengths" className="field-label">
              <Icon name="sparkles" className="mr-1 h-4 w-4 align-[-3px]" /> Защо ти? (2–3 неща за AI черновата)
            </label>
            <textarea
              id="pismo-strengths"
              className="field-input min-h-20"
              maxLength={500}
              value={s.strengths}
              onChange={(e) => set({ strengths: e.target.value })}
              placeholder="напр. 6 години опит с опаковки, спечелен конкурс, обичам работа с клиенти…"
            />
          </div>
          <AiAssist
            mode="letter"
            input={aiInput}
            label="Напиши чернова с AI"
            single
            onPick={(text) => set({ body: text })}
          />
          <div>
            <label htmlFor="pismo-body" className="field-label">
              Текст на писмото (абзаци с празен ред)
            </label>
            <textarea
              id="pismo-body"
              className="field-input min-h-48"
              maxLength={3000}
              value={s.body}
              onChange={(e) => set({ body: e.target.value })}
              placeholder="Пиши сам или започни от AI черновата и я направи своя…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <AiAssist
              mode="cv-improve"
              input={s.body}
              label="Подобри текста"
              single
              onPick={(text) => set({ body: text })}
            />
            <AiAssist
              mode="translate-en"
              input={s.body}
              label="Преведи на английски"
              single
              onPick={(text) => set({ body: text })}
            />
          </div>
        </div>

        <ProjectFile
          state={s}
          filename="mastilko-pismo"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })}
        />
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar summary="Мотивационно писмо на лист А4" />
        <SheetPreview fixedHeight={false} style={fontVars(s)}>
          <div
            style={{
              padding: `${s.margin}mm ${s.margin - 2}mm`,
              minHeight: "297mm",
              color: "#2E2620",
              fontSize: fs(3.4),
              lineHeight: 1.65,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {s.letterhead ? (
              // Цветна бланка до ръбовете на страницата (отрицателно поле).
              <div
                style={{
                  background: theme.accent,
                  color: theme.bg,
                  margin: `${-s.margin}mm ${-(s.margin - 2)}mm 8mm`,
                  padding: `${s.margin * 0.55}mm ${s.margin - 2}mm`,
                  textAlign: "right",
                }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs(5.6) }}>
                  {s.name || "Твоето име"}
                </div>
                {contact && <div style={{ fontSize: fs(3), opacity: 0.9, marginTop: "0.5mm" }}>{contact}</div>}
              </div>
            ) : (
              <>
                {/* Подател */}
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: fs(5.2),
                    }}
                  >
                    {s.name || "Твоето име"}
                  </div>
                  {contact && (
                    <div style={{ fontSize: fs(3), opacity: 0.8, marginTop: "0.5mm" }}>
                      {contact}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    height: "0.8mm",
                    background: theme.accent,
                    borderRadius: "1mm",
                    margin: "4mm 0 8mm",
                  }}
                />
              </>
            )}

            {/* Получател */}
            <div>
              {s.recipient && <div>До {s.recipient}</div>}
              {s.company && <div style={{ fontWeight: 700 }}>{s.company}</div>}
            </div>

            {s.position && (
              <div style={{ marginTop: "6mm", fontWeight: 700 }}>
                Относно: кандидатура за позицията „{s.position}“
              </div>
            )}

            <div style={{ marginTop: "6mm" }}>{greeting(s.recipient)}</div>

            {/* Тяло */}
            <div style={{ marginTop: "4mm", flex: 1 }}>
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <p key={i} style={{ marginBottom: "3.5mm", textAlign: "justify" }}>
                    {p}
                  </p>
                ))
              ) : (
                <p style={{ opacity: 0.4 }}>
                  Текстът на писмото ще се появи тук — напиши го вляво или
                  започни с AI черновата.
                </p>
              )}
            </div>

            {/* Подпис */}
            <div style={{ marginTop: "8mm" }}>
              <div>С уважение,</div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: fs(4.2),
                  marginTop: "6mm",
                }}
              >
                {s.name || "Твоето име"}
              </div>
              {(s.city || s.date) && (
                <div style={{ fontSize: fs(3), opacity: 0.8, marginTop: "1mm" }}>
                  {[s.city, s.date].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>
        </SheetPreview>
      </div>
    </div>
  );
}
