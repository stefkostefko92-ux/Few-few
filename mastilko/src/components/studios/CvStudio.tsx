"use client";

import { z } from "zod";
import { resolveTheme, fontVars, sheetBg, photoFilterCss, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import BrandKitButton from "@/components/BrandKitButton";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); mm математиката не се влияе.
// В Europass var-ът не се излъчва (контролите са скрити) → винаги натурален размер.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

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

interface CvState extends StyleState {
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
  layout: "klasik" | "moderen" | "europass";
  /** Снимка (data URL) — по желание. */
  photo: string;
  /** Форма на снимката. */
  photoShape: "circle" | "square";
  /** Размер на снимката в mm. */
  photoSize: number;
  /** Времева линия за опита. */
  timeline: boolean;
  /** Чертички за нивото на уменията (парсва „умение 4“ или „умение 80%“). */
  skillBars: boolean;
  // Полета по стандарта Europass (ползват се в Europass шаблона)
  birthDate: string;
  nationality: string;
  motherTongue: string;
  digitalSkills: string;
  driving: string;
}

// Валидация на качен проект-файл (виж бележката в LabelStudio).
const ProjectSchema = z
  .object({
    name: z.string().max(100),
    title: z.string().max(100),
    phone: z.string().max(100),
    email: z.string().max(100),
    city: z.string().max(100),
    website: z.string().max(100),
    summary: z.string().max(1000),
    jobs: z
      .array(
        z.object({
          id: z.number().int(),
          role: z.string().max(100),
          company: z.string().max(100),
          period: z.string().max(60),
          desc: z.string().max(1000),
        }),
      )
      .max(20),
    schools: z
      .array(
        z.object({
          id: z.number().int(),
          degree: z.string().max(100),
          school: z.string().max(100),
          period: z.string().max(60),
        }),
      )
      .max(20),
    skills: z.string().max(500),
    languages: z.string().max(300),
    ...StyleSchemaShape,
    layout: z.enum(["klasik", "moderen", "europass"]),
    photo: z.string().max(500000),
    photoShape: z.enum(["circle", "square"]),
    photoSize: z.number().min(15).max(45),
    timeline: z.boolean(),
    skillBars: z.boolean(),
    birthDate: z.string().max(120),
    nationality: z.string().max(120),
    motherTongue: z.string().max(120),
    digitalSkills: z.string().max(200),
    driving: z.string().max(120),
  })
  .partial();

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
  photo: "",
  photoShape: "circle",
  photoSize: 28,
  timeline: false,
  skillBars: false,
  birthDate: "",
  nationality: "",
  motherTongue: "",
  digitalSkills: "",
  driving: "",
};

// Стандартното синьо на Europass — шаблонът е унифициран за целия ЕС.
const EUROPASS_BLUE = "#0E4194";

/** „английски (B2)“ → { name: „английски“, level: „B2“ } за Europass таблицата. */
function parseLanguage(entry: string): { name: string; level: string } {
  // 1) „име (ниво)" — нивото в скоби (пази и „роден", не само CEFR).
  const paren = entry.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { name: paren[1]!.trim(), level: paren[2]!.trim() };
  // 2) „име A2" / „име А2" — CEFR ниво в края без скоби. Кирилицата А/В/С
  //    (U+0410/0412/0421) изглежда като латиница, но е друг код — нормализираме.
  const cefr = entry.match(/^(.+?)[\s–—-]+([ABCАВС])\s*([12])\s*$/i);
  if (cefr) {
    const level =
      cefr[2]!.toUpperCase().replace(/А/g, "A").replace(/В/g, "B").replace(/С/g, "C") +
      cefr[3];
    return { name: cefr[1]!.trim(), level };
  }
  return { name: entry, level: "" };
}

function splitList(s: string): string[] {
  return s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
}

/** „Photoshop 4“ / „Excel 80%“ → { name, level 0…1 }; без число → level null. */
function parseSkill(entry: string): { name: string; level: number | null } {
  const pct = entry.match(/^(.+?)\s+(\d{1,3})\s*%\s*$/);
  if (pct) return { name: pct[1]!.trim(), level: Math.min(1, Math.max(0, Number(pct[2]) / 100)) };
  const num = entry.match(/^(.+?)\s+([1-5])\s*$/);
  if (num) return { name: num[1]!.trim(), level: Number(num[2]) / 5 };
  return { name: entry, level: null };
}

/** Списък умения с чертички за нивото (mm-безопасно). */
function SkillBars({ skills, accent }: { skills: string[]; accent: string }) {
  return (
    <>
      {skills.map((sk) => {
        const { name, level } = parseSkill(sk);
        return (
          <div key={sk} style={{ marginBottom: "1.6mm" }}>
            <div style={{ fontSize: fs(3) }}>{name}</div>
            {level !== null && (
              <div style={{ height: "1.2mm", borderRadius: "1mm", background: "rgba(0,0,0,0.12)", marginTop: "0.6mm" }}>
                <div style={{ width: `${(level * 100).toFixed(0)}%`, height: "100%", borderRadius: "1mm", background: accent }} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Снимка на кандидата — фиксиран mm размер (не се влияе от размера на текста). */
function CvPhoto({ src, shape, size, filter }: { src: string; shape: "circle" | "square"; size: number; filter?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: `${size}mm`,
        height: `${size}mm`,
        objectFit: "cover",
        borderRadius: shape === "circle" ? "50%" : "1.5mm",
        display: "block",
        filter,
      }}
    />
  );
}

export default function CvStudio() {
  const [s, setS] = useLocalState<CvState>("mastilko-cv", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
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
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
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

          {s.layout !== "europass" && (
            <div className="space-y-3 border-t border-ink/10 pt-3">
              <ImageUpload
                label="Снимка (по желание)"
                value={s.photo}
                onChange={(photo) => set({ photo })}
              />
              {s.photo && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-ink-soft">
                    Форма
                    <select
                      className="field-input mt-1"
                      value={s.photoShape}
                      onChange={(e) => set({ photoShape: e.target.value as CvState["photoShape"] })}
                    >
                      <option value="circle">Кръг</option>
                      <option value="square">Квадрат</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-ink-soft">
                    <span className="flex items-baseline justify-between">
                      <span>Размер</span>
                      <span className="tabular-nums text-ink-faint">{s.photoSize} mm</span>
                    </span>
                    <input
                      type="range"
                      min={15}
                      max={45}
                      step={1}
                      value={s.photoSize}
                      onChange={(e) => set({ photoSize: Number(e.target.value) })}
                      className="mt-1 h-4 w-full accent-tera"
                      aria-label="Размер на снимката"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
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
          <div className="flex flex-wrap gap-2">
            <AiAssist
              mode="cv-summary"
              input={aiContext}
              label="Напиши профила с AI"
              single
              onPick={(text) => set({ summary: text })}
            />
            <AiAssist
              mode="translate-en"
              input={s.summary}
              label="Преведи профила на английски"
              single
              onPick={(text) => set({ summary: text })}
            />
          </div>
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
            {s.layout !== "europass" && (
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <input type="checkbox" checked={s.skillBars}
                  onChange={(e) => set({ skillBars: e.target.checked })} className="h-4 w-4 accent-tera" />
                Чертички за нивото
              </label>
            )}
            {s.skillBars && (
              <p className="mt-1 text-xs text-ink-faint">
                Добави ниво след умението: „Photoshop 4“ (от 1 до 5) или
                „Excel 80%“. Без число — само текст.
              </p>
            )}
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
              <option value="europass">Europass (стандарт на ЕС)</option>
            </select>
          </div>
          {s.layout !== "europass" && (
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input type="checkbox" checked={s.timeline}
                onChange={(e) => set({ timeline: e.target.checked })} className="h-4 w-4 accent-tera" />
              Времева линия за опита
            </label>
          )}
          {s.layout !== "europass" && (
            <>
              <BrandKitButton onApply={set} />
              <StyleControls value={s} onChange={set} hideDecor hideBorder showPhotoFx />
            </>
          )}
        </div>

        {s.layout === "europass" && (
        <div className="card-warm space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Данни за Europass</h2>
          <p className="text-sm text-ink-soft">
            Стандартът Europass на ЕС включва и тези допълнителни полета (по
            желание) — попълни ги и се показват в документа по-долу.
          </p>
          {(
            [
              ["birthDate", "Дата на раждане", "напр. 15.03.1992 г."],
              ["nationality", "Гражданство", "напр. българско"],
              ["motherTongue", "Майчин език", "напр. български"],
              ["digitalSkills", "Дигитални умения", "напр. MS Office, Canva, имейл"],
              ["driving", "Свидетелство за управление на МПС", "напр. категория B"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`cv-${key}`} className="field-label">{label}</label>
              <input
                id={`cv-${key}`}
                className="field-input"
                maxLength={120}
                value={s[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
        )}

        <ProjectFile
          state={s}
          filename="mastilko-cv"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })}
        />
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <PrintBar summary="Автобиография на лист А4 (може и няколко страници)" />
        <SheetPreview fixedHeight={false} style={fontVars(s.layout === "europass" ? { ...s, textScale: undefined } : s)}>
          {s.layout === "europass" ? (
            <EuropassCv s={s} skills={skills} languages={languages} />
          ) : s.layout === "moderen" ? (
            <div style={{ display: "flex", minHeight: "297mm" }}>
              {/* Странична лента */}
              <div
                style={{
                  width: "62mm",
                  background: sheetBg(s, theme),
                  color: theme.fg,
                  padding: "12mm 7mm",
                  flexShrink: 0,
                }}
              >
                {s.photo && (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "5mm" }}>
                    <CvPhoto src={s.photo} shape={s.photoShape} size={s.photoSize} filter={photoFilterCss(s)} />
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: fs(7),
                    lineHeight: 1.15,
                  }}
                >
                  {s.name || "Твоето име"}
                </div>
                {s.title && (
                  <div style={{ fontSize: fs(3.4), marginTop: "1.5mm", opacity: 0.85 }}>
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
                    {s.skillBars ? (
                      <SkillBars skills={skills} accent={theme.accent} />
                    ) : (
                      skills.map((sk) => (
                        <div key={sk} style={{ marginBottom: "1.2mm" }}>• {sk}</div>
                      ))
                    )}
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
                    <p style={{ fontSize: fs(3.2), lineHeight: 1.55 }}>{s.summary}</p>
                  </CvMainSection>
                )}
                <CvJobs jobs={s.jobs} accent={theme.accent} timeline={s.timeline} />
                <CvSchools schools={s.schools} accent={theme.accent} />
              </div>
            </div>
          ) : (
            <div style={{ padding: "14mm 16mm", color: "#2E2620", minHeight: "297mm" }}>
              <div style={{ textAlign: "center", marginBottom: "6mm" }}>
                {s.photo && (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "4mm" }}>
                    <CvPhoto src={s.photo} shape={s.photoShape} size={s.photoSize} filter={photoFilterCss(s)} />
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: fs(8),
                  }}
                >
                  {s.name || "Твоето име"}
                </div>
                {s.title && (
                  <div style={{ fontSize: fs(3.6), marginTop: "1mm", color: theme.accent }}>
                    {s.title}
                  </div>
                )}
                {contact.length > 0 && (
                  <div style={{ fontSize: fs(3), marginTop: "2mm", opacity: 0.8 }}>
                    {contact.join("  ·  ")}
                  </div>
                )}
              </div>
              {s.summary && (
                <CvMainSection title="Профил" accent={theme.accent}>
                  <p style={{ fontSize: fs(3.2), lineHeight: 1.55 }}>{s.summary}</p>
                </CvMainSection>
              )}
              <CvJobs jobs={s.jobs} accent={theme.accent} timeline={s.timeline} />
              <CvSchools schools={s.schools} accent={theme.accent} />
              {skills.length > 0 && (
                <CvMainSection title="Умения" accent={theme.accent}>
                  {s.skillBars ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "8mm" }}>
                      <SkillBars skills={skills} accent={theme.accent} />
                    </div>
                  ) : (
                    <p style={{ fontSize: fs(3.2), lineHeight: 1.55 }}>{skills.join(" · ")}</p>
                  )}
                </CvMainSection>
              )}
              {languages.length > 0 && (
                <CvMainSection title="Езици" accent={theme.accent}>
                  <p style={{ fontSize: fs(3.2), lineHeight: 1.55 }}>{languages.join(" · ")}</p>
                </CvMainSection>
              )}
            </div>
          )}
        </SheetPreview>
      </div>
    </div>
  );
}

/** Ред от Europass мрежата: син етикет вляво, съдържание с вертикална линия. */
function EpRow({
  label,
  children,
  first,
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48mm 1fr" }}>
      <div
        style={{
          color: EUROPASS_BLUE,
          fontWeight: 700,
          fontSize: fs(3),
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          textAlign: "right",
          paddingRight: "4mm",
          paddingTop: first ? 0 : "6mm",
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          borderLeft: "0.35mm solid #9AB0D8",
          paddingLeft: "4mm",
          paddingTop: first ? 0 : "6mm",
          paddingBottom: "1mm",
          fontSize: fs(3.2),
          lineHeight: 1.5,
          breakInside: "avoid",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EuropassCv({
  s,
  skills,
  languages,
}: {
  s: CvState;
  skills: string[];
  languages: string[];
}) {
  const contact = [
    s.phone && ["Телефон", s.phone],
    s.email && ["Имейл", s.email],
    s.city && ["Град", s.city],
    s.website && ["Уеб", s.website],
    s.birthDate && ["Дата на раждане", s.birthDate],
    s.nationality && ["Гражданство", s.nationality],
  ].filter(Boolean) as Array<[string, string]>;

  const langRows = languages.map(parseLanguage);
  const filledJobs = s.jobs.filter((j) => j.role || j.company || j.desc);
  const filledSchools = s.schools.filter((e) => e.degree || e.school);
  const cellStyle: React.CSSProperties = {
    border: "0.2mm solid #9AB0D8",
    padding: "1mm 2.5mm",
    textAlign: "left",
  };

  return (
    <div style={{ padding: "12mm 12mm 14mm 8mm", color: "#1B1B1B", minHeight: "297mm" }}>
      <EpRow first label="Автобиография">
        <div
          style={{
            fontWeight: 800,
            fontSize: fs(6.4),
            color: EUROPASS_BLUE,
            lineHeight: 1.15,
          }}
        >
          {s.name || "Твоето име"}
        </div>
        {s.title && (
          <div style={{ fontSize: fs(3.4), marginTop: "1mm" }}>{s.title}</div>
        )}
      </EpRow>

      {contact.length > 0 && (
        <EpRow label="Лична информация">
          {contact.map(([k, v]) => (
            <div key={k}>
              <span style={{ fontWeight: 700 }}>{k}: </span>
              {v}
            </div>
          ))}
        </EpRow>
      )}

      {s.summary && <EpRow label="Професионален профил">{s.summary}</EpRow>}

      {filledJobs.length > 0 && (
        <EpRow label="Трудов стаж">
          {filledJobs.map((j) => (
            <div key={j.id} style={{ marginBottom: "3.5mm", breakInside: "avoid" }}>
              {j.period && (
                <div style={{ color: EUROPASS_BLUE, fontWeight: 700, fontSize: fs(2.9) }}>
                  {j.period}
                </div>
              )}
              <div style={{ fontWeight: 700 }}>
                {j.role}
                {j.company && (
                  <span style={{ fontWeight: 400 }}> — {j.company}</span>
                )}
              </div>
              {j.desc && <div style={{ marginTop: "0.6mm" }}>{j.desc}</div>}
            </div>
          ))}
        </EpRow>
      )}

      {filledSchools.length > 0 && (
        <EpRow label="Образование и обучение">
          {filledSchools.map((e) => (
            <div key={e.id} style={{ marginBottom: "2.5mm", breakInside: "avoid" }}>
              {e.period && (
                <div style={{ color: EUROPASS_BLUE, fontWeight: 700, fontSize: fs(2.9) }}>
                  {e.period}
                </div>
              )}
              <div style={{ fontWeight: 700 }}>
                {e.degree}
                {e.school && <span style={{ fontWeight: 400 }}> — {e.school}</span>}
              </div>
            </div>
          ))}
        </EpRow>
      )}

      {(s.motherTongue || langRows.length > 0 || skills.length > 0 || s.digitalSkills || s.driving) && (
        <EpRow label="Лични умения">
          {s.motherTongue && (
            <div style={{ marginBottom: "2mm" }}>
              <span style={{ fontWeight: 700 }}>Майчин език: </span>
              {s.motherTongue}
            </div>
          )}
          {langRows.length > 0 && (
            <div style={{ marginBottom: "2.5mm" }}>
              <div style={{ fontWeight: 700, marginBottom: "1mm" }}>Чужди езици</div>
              <table style={{ borderCollapse: "collapse", fontSize: fs(3), width: "100%" }}>
                <thead>
                  <tr style={{ color: EUROPASS_BLUE }}>
                    <th style={cellStyle}>Език</th>
                    <th style={cellStyle}>Ниво (ОЕЕР)</th>
                  </tr>
                </thead>
                <tbody>
                  {langRows.map((l) => (
                    <tr key={l.name}>
                      <td style={cellStyle}>{l.name}</td>
                      <td style={cellStyle}>{l.level || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {skills.length > 0 && (
            <div style={{ marginBottom: "2mm" }}>
              <span style={{ fontWeight: 700 }}>Умения: </span>
              {skills.join(", ")}
            </div>
          )}
          {s.digitalSkills && (
            <div style={{ marginBottom: "2mm" }}>
              <span style={{ fontWeight: 700 }}>Дигитални умения: </span>
              {s.digitalSkills}
            </div>
          )}
          {s.driving && (
            <div>
              <span style={{ fontWeight: 700 }}>
                Свидетелство за управление на МПС:{" "}
              </span>
              {s.driving}
            </div>
          )}
        </EpRow>
      )}
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
          fontSize: fs(3.4),
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: `0.6mm solid ${accent}`,
          paddingBottom: "1mm",
          marginBottom: "2.5mm",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: fs(3), lineHeight: 1.5 }}>{children}</div>
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
          fontSize: fs(4.4),
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

function CvJobs({ jobs, accent, timeline }: { jobs: Job[]; accent: string; timeline?: boolean }) {
  const filled = jobs.filter((j) => j.role || j.company || j.desc);
  if (filled.length === 0) return null;
  return (
    <CvMainSection title="Опит" accent={accent}>
      <div style={timeline ? { borderLeft: `0.4mm solid ${accent}`, paddingLeft: "5mm", marginLeft: "1mm" } : undefined}>
        {filled.map((j) => (
          <div key={j.id} style={{ position: "relative", marginBottom: "4mm", breakInside: "avoid" }}>
            {timeline && (
              <span style={{ position: "absolute", left: "-6.2mm", top: "1.2mm", width: "2.4mm", height: "2.4mm", borderRadius: "50%", background: accent }} />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
              <span style={{ fontWeight: 700, fontSize: fs(3.4) }}>
                {j.role}
                {j.company && (
                  <span style={{ fontWeight: 400, opacity: 0.75 }}> · {j.company}</span>
                )}
              </span>
              {j.period && (
                <span style={{ fontSize: fs(3), opacity: 0.7, whiteSpace: "nowrap" }}>
                  {j.period}
                </span>
              )}
            </div>
            {j.desc && (
              <p style={{ fontSize: fs(3.1), lineHeight: 1.5, marginTop: "1mm" }}>{j.desc}</p>
            )}
          </div>
        ))}
      </div>
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
            <span style={{ fontWeight: 700, fontSize: fs(3.4) }}>
              {e.degree}
              {e.school && (
                <span style={{ fontWeight: 400, opacity: 0.75 }}> · {e.school}</span>
              )}
            </span>
            {e.period && (
              <span style={{ fontSize: fs(3), opacity: 0.7, whiteSpace: "nowrap" }}>
                {e.period}
              </span>
            )}
          </div>
        </div>
      ))}
    </CvMainSection>
  );
}
