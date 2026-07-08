"use client";

import { z } from "zod";
import { themeById } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import ThemePicker from "@/components/ThemePicker";

interface PismoState {
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
    themeId: z.string().max(20),
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
};

export default function PismoStudio() {
  const [s, setS] = useLocalState<PismoState>("mastilko-pismo", INITIAL);
  const theme = themeById(s.themeId);
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
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
          <div>
            <span className="field-label">Акцентен цвят</span>
            <ThemePicker value={s.themeId} onChange={(id) => set({ themeId: id })} />
          </div>
        </div>

        <div className="card-warm space-y-3 p-5">
          <div>
            <label htmlFor="pismo-strengths" className="field-label">
              ✨ Защо ти? (2–3 неща за AI черновата)
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
        <SheetPreview fixedHeight={false}>
          <div
            style={{
              padding: "20mm 18mm",
              minHeight: "297mm",
              color: "#2E2620",
              fontSize: "3.4mm",
              lineHeight: 1.65,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Подател */}
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "5.2mm",
                }}
              >
                {s.name || "Твоето име"}
              </div>
              {contact && (
                <div style={{ fontSize: "3mm", opacity: 0.8, marginTop: "0.5mm" }}>
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
                  fontSize: "4.2mm",
                  marginTop: "6mm",
                }}
              >
                {s.name || "Твоето име"}
              </div>
              {(s.city || s.date) && (
                <div style={{ fontSize: "3mm", opacity: 0.8, marginTop: "1mm" }}>
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
