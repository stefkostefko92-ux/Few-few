"use client";

import { themeById } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import PrintBar from "@/components/PrintBar";
import SheetPreview from "@/components/SheetPreview";
import ThemePicker from "@/components/ThemePicker";

interface Job {
  id: number;
  role: string;
  company: string;
  period: string;
  desc: string;
}

interface School {
  id: number;
  degree: string;
  school: string;
  period: string;
}

interface CvState {
  name: string;
  title: string;
  phone: string;
  email: string;
  city: string;
  website: string;
  summary: string;
  jobs: Job[];
  schools: School[];
  skills: string;
  languages: string;
  themeId: string;
  layout: "klasik" | "moderen";
}

const INITIAL: CvState = {
  name: "",
  title: "",
  phone: "",
  email: "",
  city: "",
  website: "",
  summary: "",
  jobs: [{ id: 1, role: "", company: "", period: "", desc: "" }],
  schools: [{ id: 1, degree: "", school: "", period: "" }],
  skills: "",
  languages: "",
  themeId: "gora",
  layout: "moderen",
};

function splitList(s: string): string[] {
  return s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
}

export default function CvStudio() {
  const [s, setS] = useLocalState<CvState>("mastilko-cv", INITIAL);
  const theme = themeById(s.themeId);
  const set = (patch: Partial<CvState>) => setS({ ...s, ...patch });

  const setJob = (id: number, patch: Partial<Job>) =>
    set({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  const setSchool = (id: number, patch: Partial<School>) =>
    set({ schools: s.schools.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const nextId = (arr: Array<{ id: number }>) =>
    arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;

  const aiContext = [
    s.title && `професия: ${s.title}`,
    ...s.jobs.filter((j) => j.role).map((j) => `опит: ${j.role} в ${j.company}`),
    s.skills && `умения: ${s.skills}`,
  ]
    .filter(Boolean)
    .join("; ");

  const skills = splitList(s.skills);
  const languages = splitList(s.languages);
  const contact = [s.phone, s.email, s.city, s.website].filter(Boolean);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* Контроли */}
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Лични данни</h2>
          {(
            [
              ["name", "Име и фамилия", "напр. Иван Петров"],
              ["title", "Професия / желана позиция", "напр. Графичен дизайнер"],
              ["phone", "Телефон", "+359 …"],
              ["email", "Имейл", "ivan@primer.bg"],
              ["city", "Град", "напр. София"],
              ["website", "Сайт / LinkedIn (по желание)", "linkedin.com/in/…"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`cv-${key}`} className="field-label">{label}</label>
              <input
                id={`cv-${key}`}
                className="field-input"
                maxLength={80}
                value={s[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        <div className="card-warm space-y-3 p-5">
          <h2 className="font-display text-lg font-bold">Профил</h2>
          <textarea
            aria-label="Професионален профил"
            className="field-input min-h-24"
            maxLength={600}
            value={s.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="2–3 изречения кой си и какво търсиш…"
          />
          <AiAssist
            mode="cv-summary"
            input={aiContext}
            label="Напиши профила с AI"
            single
            onPick={(text) => set({ summary: text })}
          />
        </div>

        <div className="card-warm space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Опит</h2>
          {s.jobs.map((j, idx) => (
            <fieldset key={j.id} className="space-y-2 rounded-xl border border-ink/10 p-3">
              <legend className="px-1 text-xs font-bold text-ink-faint">
                Позиция {idx + 1}
              </legend>
              <input
                aria-label={`Длъжност ${idx + 1}`}
                className="field-input"
                maxLength={80}
                value={j.role}
                onChange={(e) => setJob(j.id, { role: e.target.value })}
                placeholder="Длъжност, напр. Продавач-консултант"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label={`Фирма ${idx + 1}`}
                  className="field-input"
                  maxLength={80}
                  value={j.company}
                  onChange={(e) => setJob(j.id, { company: e.target.value })}
                  placeholder="Фирма"
                />
                <input
                  aria-label={`Период ${idx + 1}`}
                  className="field-input"
                  maxLength={40}
                  value={j.period}
                  onChange={(e) => setJob(j.id, { period: e.target.value })}
                  placeholder="2022 – 2025"
                />
              </div>
              <textarea
                aria-label={`Описание ${idx + 1}`}
                className="field-input min-h-20"
                maxLength={800}
                value={j.desc}
                onChange={(e) => setJob(j.id, { desc: e.target.value })}
                placeholder="Какво правеше и какво постигна…"
              />
              <div className="flex items-start justify-between gap-2">
                <AiAssist
                  mode="cv-improve"
                  input={j.desc}
                  label="Подобри описанието"
                  single
                  onPick={(text) => setJob(j.id, { desc: text })}
                />
                {s.jobs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set({ jobs: s.jobs.filter((x) => x.id !== j.id) })}
                    className="shrink-0 text-sm font-semibold text-tera-dark hover:underline"
                  >
                    Премахни
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() =>
              set({
                jobs: [
                  ...s.jobs,
                  { id: nextId(s.jobs), role: "", company: "", period: "", desc: "" },
                ],
              })
            }
          >
            + Добави позиция
          </button>
        </div>

        <div className="card-warm space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Образование</h2>
          {s.schools.map((e, idx) => (
            <fieldset key={e.id} className="space-y-2 rounded-xl border border-ink/10 p-3">
              <legend className="px-1 text-xs font-bold text-ink-faint">
                Образование {idx + 1}
              </legend>
              <input
                aria-label={`Специалност ${idx + 1}`}
                className="field-input"
                maxLength={80}
                value={e.degree}
                onChange={(ev) => setSchool(e.id, { degree: ev.target.value })}
                placeholder="Специалност / степен"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label={`Учебно заведение ${idx + 1}`}
                  className="field-input"
                  maxLength={80}
                  value={e.school}
                  onChange={(ev) => setSchool(e.id, { school: ev.target.value })}
                  placeholder="Училище / университет"
                />
                <input
                  aria-label={`Период на обучение ${idx + 1}`}
                  className="field-input"
                  maxLength={40}
                  value={e.period}
                  onChange={(ev) => setSchool(e.id, { period: ev.target.value })}
                  placeholder="2018 – 2022"
                />
              </div>
              {s.schools.length > 1 && (
                <button
                  type="button"
                  onClick={() => set({ schools: s.schools.filter((x) => x.id !== e.id) })}
                  className="text-sm font-semibold text-tera-dark hover:underline"
                >
                  Премахни
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() =>
              set({
                schools: [
                  ...s.schools,
                  { id: nextId(s.schools), degree: "", school: "", period: "" },
                ],
              })
            }
          >
            + Добави образование
          </button>
        </div>

        <div className="card-warm space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Умения и езици</h2>
          <div>
            <label htmlFor="cv-skills" className="field-label">
              Умения (разделени със запетая)
            </label>
            <input
              id="cv-skills"
              className="field-input"
              maxLength={300}
              value={s.skills}
              onChange={(e) => set({ skills: e.target.value })}
              placeholder="напр. Photoshop, работа с клиенти, Excel"
            />
          </div>
          <div>
            <label htmlFor="cv-langs" className="field-label">
              Езици (разделени със запетая)
            </label>
            <input
              id="cv-langs"
              className="field-input"
              maxLength={200}
              value={s.languages}
              onChange={(e) => set({ languages: e.target.value })}
              placeholder="напр. български (роден), английски (B2)"
            />
          </div>
          <div>
            <label htmlFor="cv-layout" className="field-label">Шаблон</label>
            <select
              id="cv-layout"
              className="field-input"
              value={s.layout}
              onChange={(e) => set({ layout: e.target.value as CvState["layout"] })}
            >
              <option value="moderen">Модерен (с цветна лента)</option>
              <option value="klasik">Класически (една колона)</option>
            </select>
          </div>
          <div>
            <span className="field-label">Акцентен цвят</span>
            <ThemePicker value={s.themeId} onChange={(id) => set({ themeId: id })} />
          </div>
        </div>
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar summary="Автобиография на лист А4 (може и няколко страници)" />
        <SheetPreview fixedHeight={false}>
          {s.layout === "moderen" ? (
            <div style={{ display: "flex", minHeight: "297mm" }}>
              {/* Странична лента */}
              <div
                style={{
                  width: "62mm",
                  background: theme.bg,
                  color: theme.fg,
                  padding: "12mm 7mm",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "7mm",
                    lineHeight: 1.15,
                  }}
                >
                  {s.name || "Твоето име"}
                </div>
                {s.title && (
                  <div style={{ fontSize: "3.4mm", marginTop: "1.5mm", opacity: 0.85 }}>
                    {s.title}
                  </div>
                )}
                {contact.length > 0 && (
                  <CvSideSection title="Контакти" accent={theme.accent}>
                    {contact.map((c) => (
                      <div key={c} style={{ marginBottom: "1.2mm", wordBreak: "break-word" }}>
                        {c}
                      </div>
                    ))}
                  </CvSideSection>
                )}
                {skills.length > 0 && (
                  <CvSideSection title="Умения" accent={theme.accent}>
                    {skills.map((sk) => (
                      <div key={sk} style={{ marginBottom: "1.2mm" }}>• {sk}</div>
                    ))}
                  </CvSideSection>
                )}
                {languages.length > 0 && (
                  <CvSideSection title="Езици" accent={theme.accent}>
                    {languages.map((l) => (
                      <div key={l} style={{ marginBottom: "1.2mm" }}>• {l}</div>
                    ))}
                  </CvSideSection>
                )}
              </div>
              {/* Основна колона */}
              <div style={{ flex: 1, padding: "12mm 10mm", color: "#2E2620" }}>
                {s.summary && (
                  <CvMainSection title="Профил" accent={theme.accent}>
                    <p style={{ fontSize: "3.2mm", lineHeight: 1.55 }}>{s.summary}</p>
                  </CvMainSection>
                )}
                <CvJobs jobs={s.jobs} accent={theme.accent} />
                <CvSchools schools={s.schools} accent={theme.accent} />
              </div>
            </div>
          ) : (
            <div style={{ padding: "14mm 16mm", color: "#2E2620", minHeight: "297mm" }}>
              <div style={{ textAlign: "center", marginBottom: "6mm" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "8mm",
                  }}
                >
                  {s.name || "Твоето име"}
                </div>
                {s.title && (
                  <div style={{ fontSize: "3.6mm", marginTop: "1mm", color: theme.accent }}>
                    {s.title}
                  </div>
                )}
                {contact.length > 0 && (
                  <div style={{ fontSize: "3mm", marginTop: "2mm", opacity: 0.8 }}>
                    {contact.join("  ·  ")}
                  </div>
                )}
              </div>
              {s.summary && (
                <CvMainSection title="Профил" accent={theme.accent}>
                  <p style={{ fontSize: "3.2mm", lineHeight: 1.55 }}>{s.summary}</p>
                </CvMainSection>
              )}
              <CvJobs jobs={s.jobs} accent={theme.accent} />
              <CvSchools schools={s.schools} accent={theme.accent} />
              {skills.length > 0 && (
                <CvMainSection title="Умения" accent={theme.accent}>
                  <p style={{ fontSize: "3.2mm", lineHeight: 1.55 }}>{skills.join(" · ")}</p>
                </CvMainSection>
              )}
              {languages.length > 0 && (
                <CvMainSection title="Езици" accent={theme.accent}>
                  <p style={{ fontSize: "3.2mm", lineHeight: 1.55 }}>{languages.join(" · ")}</p>
                </CvMainSection>
              )}
            </div>
          )}
        </SheetPreview>
      </div>
    </div>
  );
}

function CvSideSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "7mm" }}>
      <div
        style={{
          fontWeight: 800,
          fontSize: "3.4mm",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: `0.6mm solid ${accent}`,
          paddingBottom: "1mm",
          marginBottom: "2.5mm",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "3mm", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function CvMainSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "6mm", breakInside: "avoid" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "4.4mm",
          color: accent,
          borderBottom: "0.3mm solid rgba(0,0,0,0.15)",
          paddingBottom: "1mm",
          marginBottom: "2.5mm",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function CvJobs({ jobs, accent }: { jobs: Job[]; accent: string }) {
  const filled = jobs.filter((j) => j.role || j.company || j.desc);
  if (filled.length === 0) return null;
  return (
    <CvMainSection title="Опит" accent={accent}>
      {filled.map((j) => (
        <div key={j.id} style={{ marginBottom: "4mm", breakInside: "avoid" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
            <span style={{ fontWeight: 700, fontSize: "3.4mm" }}>
              {j.role}
              {j.company && (
                <span style={{ fontWeight: 400, opacity: 0.75 }}> · {j.company}</span>
              )}
            </span>
            {j.period && (
              <span style={{ fontSize: "3mm", opacity: 0.7, whiteSpace: "nowrap" }}>
                {j.period}
              </span>
            )}
          </div>
          {j.desc && (
            <p style={{ fontSize: "3.1mm", lineHeight: 1.5, marginTop: "1mm" }}>{j.desc}</p>
          )}
        </div>
      ))}
    </CvMainSection>
  );
}

function CvSchools({ schools, accent }: { schools: School[]; accent: string }) {
  const filled = schools.filter((e) => e.degree || e.school);
  if (filled.length === 0) return null;
  return (
    <CvMainSection title="Образование" accent={accent}>
      {filled.map((e) => (
        <div key={e.id} style={{ marginBottom: "3mm", breakInside: "avoid" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
            <span style={{ fontWeight: 700, fontSize: "3.4mm" }}>
              {e.degree}
              {e.school && (
                <span style={{ fontWeight: 400, opacity: 0.75 }}> · {e.school}</span>
              )}
            </span>
            {e.period && (
              <span style={{ fontSize: "3mm", opacity: 0.7, whiteSpace: "nowrap" }}>
                {e.period}
              </span>
            )}
          </div>
        </div>
      ))}
    </CvMainSection>
  );
}
