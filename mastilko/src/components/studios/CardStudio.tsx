"use client";

import { z } from "zod";
import { CARD, cardGrid } from "@/lib/print";
import { themeById, type WarmTheme } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import { vCard } from "@/lib/vcard";
import AiAssist from "@/components/AiAssist";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import QrImage, { useQrDataUrl } from "@/components/QrImage";
import SheetPreview from "@/components/SheetPreview";
import ThemePicker from "@/components/ThemePicker";

interface CardState {
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  slogan: string;
  themeId: string;
  layout: "lenta" | "klasik" | "linia" | "ramka" | "gorna" | "duo";
  cutLines: boolean;
  /** QR код с контактите (vCard) в долния десен ъгъл. */
  qr: boolean;
  /** Лого (data URL) — показва се в акцентния панел. */
  logo: string;
  /** Гръб на визитката (втори лист за двустранен печат). */
  back: boolean;
}

const INITIAL: CardState = {
  name: "Мария Иванова",
  role: "Сладкар",
  company: "Сладкарница „Мечта“",
  phone: "+359 88 123 4567",
  email: "maria@mechta.bg",
  website: "mechta.bg",
  slogan: "Сладко, изпечено с любов",
  themeId: "tera",
  layout: "lenta",
  cutLines: true,
  qr: false,
  logo: "",
  back: false,
};

// Валидация на качен проект-файл (виж бележката в LabelStudio).
const ProjectSchema = z
  .object({
    name: z.string().max(60),
    role: z.string().max(60),
    company: z.string().max(60),
    phone: z.string().max(60),
    email: z.string().max(60),
    website: z.string().max(60),
    slogan: z.string().max(60),
    themeId: z.string().max(20),
    layout: z.enum(["lenta", "klasik", "linia", "ramka", "gorna", "duo"]),
    cutLines: z.boolean(),
    qr: z.boolean(),
    logo: z.string().max(500000),
    back: z.boolean(),
  })
  .partial();

const LAYOUTS: Array<{ id: CardState["layout"]; name: string }> = [
  { id: "lenta", name: "Лента отляво" },
  { id: "klasik", name: "Класик (центрирано)" },
  { id: "linia", name: "Долна линия" },
  { id: "ramka", name: "Рамка (елегантна)" },
  { id: "gorna", name: "Горна лента" },
  { id: "duo", name: "Дуо (панел отдясно)" },
];

/** Размерна единица: на листа — mm; в големия преглед — px (mm × mult). */
type Unit = (v: number) => string;

/** Обвивка: шаблонът + (по желание) QR с vCard в долния десен ъгъл. */
function CardFace({
  s,
  theme,
  u,
  qrSrc,
}: {
  s: CardState;
  theme: WarmTheme;
  u: Unit;
  qrSrc: string | null;
}) {
  return (
    <div style={{ position: "relative", width: u(CARD.w), height: u(CARD.h) }}>
      <CardFaceInner s={s} theme={theme} u={u} />
      {s.qr && qrSrc && (
        <QrImage
          src={qrSrc}
          style={{
            position: "absolute",
            right: u(3),
            bottom: s.layout === "linia" ? u(6.5) : u(3),
            width: u(11),
            height: u(11),
            background: "#FFFFFF",
            padding: u(0.7),
            borderRadius: u(1),
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

/** Гръб на визитката: акцентен фон с лого/инициал + слоган. */
function CardBack({ s, theme, u }: { s: CardState; theme: WarmTheme; u: Unit }) {
  const initials = s.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      style={{
        width: u(CARD.w),
        height: u(CARD.h),
        background: theme.accent,
        color: theme.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: u(2),
        padding: u(6),
        textAlign: "center",
      }}
    >
      {s.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.logo} alt="" style={{ maxWidth: u(40), maxHeight: u(24), objectFit: "contain" }} />
      ) : (
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: u(14) }}>
          {initials || "М"}
        </div>
      )}
      {s.company && <div style={{ fontWeight: 700, fontSize: u(4) }}>{s.company}</div>}
      {s.slogan && <div style={{ fontStyle: "italic", fontSize: u(3) }}>„{s.slogan}“</div>}
    </div>
  );
}

function CardFaceInner({
  s,
  theme,
  u,
}: {
  s: CardState;
  theme: WarmTheme;
  u: Unit;
}) {
  const initials = s.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const contact = [s.phone, s.email, s.website].filter(Boolean);

  const base: React.CSSProperties = {
    width: u(CARD.w),
    height: u(CARD.h),
    background: theme.bg,
    color: theme.fg,
    overflow: "hidden",
    display: "flex",
    fontFamily: "var(--font-sans)",
  };

  if (s.layout === "lenta") {
    return (
      <div style={base}>
        <div
          style={{
            width: u(26),
            background: theme.accent,
            color: theme.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: u(9),
            fontFamily: "var(--font-display)",
          }}
        >
          {s.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo} alt="" style={{ maxWidth: u(20), maxHeight: u(20), objectFit: "contain" }} />
          ) : (
            initials || "М"
          )}
        </div>
        <div
          style={{
            flex: 1,
            padding: `${u(5)} ${u(6)}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: u(4.6), lineHeight: 1.15 }}>
            {s.name || "Твоето име"}
          </div>
          {(s.role || s.company) && (
            <div style={{ fontSize: u(2.9), marginTop: u(0.8), opacity: 0.85 }}>
              {[s.role, s.company].filter(Boolean).join(" · ")}
            </div>
          )}
          {s.slogan && (
            <div
              style={{
                fontSize: u(2.6),
                marginTop: u(1.6),
                fontStyle: "italic",
                color: theme.accent,
              }}
            >
              „{s.slogan}“
            </div>
          )}
          <div style={{ marginTop: u(2.4), fontSize: u(2.7), lineHeight: 1.5 }}>
            {contact.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (s.layout === "klasik") {
    return (
      <div
        style={{
          ...base,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: `${u(4)} ${u(6)}`,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: u(5),
            fontFamily: "var(--font-display)",
          }}
        >
          {s.name || "Твоето име"}
        </div>
        <div
          style={{
            width: u(18),
            height: u(0.8),
            background: theme.accent,
            borderRadius: u(1),
            margin: `${u(1.6)} 0`,
          }}
        />
        {(s.role || s.company) && (
          <div style={{ fontSize: u(3), opacity: 0.85 }}>
            {[s.role, s.company].filter(Boolean).join(" · ")}
          </div>
        )}
        {s.slogan && (
          <div
            style={{
              fontSize: u(2.6),
              marginTop: u(1.4),
              fontStyle: "italic",
              color: theme.accent,
            }}
          >
            „{s.slogan}“
          </div>
        )}
        <div style={{ marginTop: u(2.2), fontSize: u(2.7), lineHeight: 1.5 }}>
          {contact.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
      </div>
    );
  }

  if (s.layout === "ramka") {
    return (
      <div style={{ ...base, padding: u(2.2) }}>
        <div
          style={{
            flex: 1,
            border: `${u(0.4)} solid ${theme.accent}`,
            outline: `${u(0.15)} solid ${theme.accent}`,
            outlineOffset: `-${u(1.2)}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: `${u(3)} ${u(5)}`,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: u(4.8),
              fontFamily: "var(--font-display)",
            }}
          >
            {s.name || "Твоето име"}
          </div>
          {(s.role || s.company) && (
            <div style={{ fontSize: u(2.9), marginTop: u(1), opacity: 0.85 }}>
              {[s.role, s.company].filter(Boolean).join(" · ")}
            </div>
          )}
          {s.slogan && (
            <div
              style={{
                fontSize: u(2.5),
                marginTop: u(1.4),
                fontStyle: "italic",
                color: theme.accent,
              }}
            >
              „{s.slogan}“
            </div>
          )}
          <div style={{ marginTop: u(2), fontSize: u(2.6), lineHeight: 1.5 }}>
            {contact.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (s.layout === "gorna") {
    return (
      <div style={{ ...base, flexDirection: "column" }}>
        <div
          style={{
            background: theme.accent,
            color: theme.bg,
            padding: `${u(3.5)} ${u(6)}`,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: u(4.6),
              fontFamily: "var(--font-display)",
              lineHeight: 1.1,
            }}
          >
            {s.name || "Твоето име"}
          </div>
          {(s.role || s.company) && (
            <div style={{ fontSize: u(2.8), marginTop: u(0.6), opacity: 0.9 }}>
              {[s.role, s.company].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div
          style={{
            flex: 1,
            padding: `${u(3)} ${u(6)}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: u(2.7), lineHeight: 1.55 }}>
            {contact.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          {s.slogan && (
            <div
              style={{
                fontSize: u(2.5),
                marginTop: u(1.6),
                fontStyle: "italic",
                color: theme.accent,
                textAlign: "right",
              }}
            >
              „{s.slogan}“
            </div>
          )}
        </div>
      </div>
    );
  }

  if (s.layout === "duo") {
    return (
      <div style={base}>
        <div
          style={{
            flex: 1,
            padding: `${u(5)} ${u(5.5)}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: u(4.5), lineHeight: 1.15 }}>
            {s.name || "Твоето име"}
          </div>
          {(s.role || s.company) && (
            <div style={{ fontSize: u(2.8), marginTop: u(0.8), opacity: 0.85 }}>
              {[s.role, s.company].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ marginTop: u(2.2), fontSize: u(2.6), lineHeight: 1.5 }}>
            {contact.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
        </div>
        <div
          style={{
            width: u(24),
            background: theme.accent,
            color: theme.bg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: u(1.5),
            padding: u(2),
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: u(8),
              fontFamily: "var(--font-display)",
            }}
          >
            {s.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo} alt="" style={{ maxWidth: u(18), maxHeight: u(18), objectFit: "contain" }} />
            ) : (
              initials || "М"
            )}
          </div>
          {s.slogan && (
            <div
              style={{
                fontSize: u(2.1),
                fontStyle: "italic",
                textAlign: "center",
                opacity: 0.9,
              }}
            >
              {s.slogan}
            </div>
          )}
        </div>
      </div>
    );
  }

  // "linia" — чиста визитка с дебела долна акцентна линия
  return (
    <div style={{ ...base, flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          padding: `${u(5)} ${u(6)}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: u(4.8), lineHeight: 1.15 }}>
          {s.name || "Твоето име"}
        </div>
        {(s.role || s.company) && (
          <div style={{ fontSize: u(2.9), marginTop: u(0.8), opacity: 0.85 }}>
            {[s.role, s.company].filter(Boolean).join(" · ")}
          </div>
        )}
        <div
          style={{
            marginTop: u(2.4),
            fontSize: u(2.7),
            lineHeight: 1.5,
            display: "flex",
            flexWrap: "wrap",
            gap: `0 ${u(4)}`,
          }}
        >
          {contact.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ height: u(4.5), background: theme.accent }} />
    </div>
  );
}

export default function CardStudio() {
  const [s, setS] = useLocalState<CardState>("mastilko-cards", INITIAL);
  const theme = themeById(s.themeId);
  const grid = cardGrid();
  const px: Unit = (v) => `${v * 3.4}px`;
  const mm: Unit = (v) => `${v}mm`;

  const set = (patch: Partial<CardState>) => setS({ ...s, ...patch });

  // Един QR за целия лист + близкия преглед — не по един на визитка.
  const qrSrc = useQrDataUrl(s.qr && s.name.trim() ? vCard(s) : "");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* Контроли */}
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          {(
            [
              ["name", "Име и фамилия", "напр. Мария Иванова"],
              ["role", "Длъжност / професия", "напр. Сладкар"],
              ["company", "Фирма (по желание)", "напр. Сладкарница „Мечта“"],
              ["phone", "Телефон", "+359 …"],
              ["email", "Имейл", "ti@primer.bg"],
              ["website", "Сайт (по желание)", "primer.bg"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`card-${key}`} className="field-label">{label}</label>
              <input
                id={`card-${key}`}
                className="field-input"
                maxLength={60}
                value={s[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}

          <div>
            <label htmlFor="card-layout" className="field-label">Шаблон</label>
            <select
              id="card-layout"
              className="field-input"
              value={s.layout}
              onChange={(e) => set({ layout: e.target.value as CardState["layout"] })}
            >
              {LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="field-label">Цветова тема</span>
            <ThemePicker value={s.themeId} onChange={(id) => set({ themeId: id })} />
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.cutLines}
              onChange={(e) => set({ cutLines: e.target.checked })}
              className="h-4 w-4 accent-tera"
            />
            Тънки линии за рязане на листа
          </label>

          <label className="flex items-start gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.qr}
              onChange={(e) => set({ qr: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-tera"
            />
            <span>
              QR код с контактите (vCard)
              <span className="block text-xs font-normal text-ink-faint">
                Сканираш с камерата и контактът влиза в телефона. Генерира се
                в твоя браузър — нищо не се изпраща навън.
              </span>
            </span>
          </label>

          <ImageUpload value={s.logo} onChange={(v) => set({ logo: v })} label="Лого (по желание)" />

          <label className="flex items-start gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={s.back}
              onChange={(e) => set({ back: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-tera"
            />
            <span>
              Двустранни визитки (гръб)
              <span className="block text-xs font-normal text-ink-faint">
                Втори лист с лого и слоган. Принтираш го на гърба (обърни
                листа и пусни страница 2).
              </span>
            </span>
          </label>
        </div>

        <div className="card-warm space-y-3 p-5">
          <div>
            <label htmlFor="card-slogan" className="field-label">Слоган (по желание)</label>
            <input
              id="card-slogan"
              className="field-input"
              maxLength={60}
              value={s.slogan}
              onChange={(e) => set({ slogan: e.target.value })}
              placeholder="напр. Сладко, изпечено с любов"
            />
          </div>
          <AiAssist
            mode="card"
            input={[s.role, s.company].filter(Boolean).join(", ")}
            label="Предложи слоган с AI"
            onPick={(text) => set({ slogan: text })}
          />
        </div>
      </div>

      {/* Преглед + печат */}
      <div className="space-y-4">
        <div className="no-print card-warm p-5">
          <p className="field-label">Преглед отблизо</p>
          <div className="overflow-x-auto rounded-xl">
            <div className="w-fit shadow-lift" style={{ borderRadius: 6 }}>
              <CardFace s={s} theme={theme} u={px} qrSrc={qrSrc} />
            </div>
          </div>
        </div>

        <PrintBar summary={`${grid.total} визитки (90 × 54 mm) на лист А4`} />
        <SheetPreview>
          {Array.from({ length: grid.total }).map((_, i) => {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const left = grid.offsetX + col * CARD.w;
            const top = grid.offsetY + row * CARD.h;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${left}mm`,
                  top: `${top}mm`,
                  outline: s.cutLines
                    ? "0.2mm dashed rgba(120,110,100,0.5)"
                    : "none",
                }}
              >
                <CardFace s={s} theme={theme} u={mm} qrSrc={qrSrc} />
              </div>
            );
          })}
        </SheetPreview>

        {s.back && (
          <>
            <PrintBar summary="Гръб на визитките — лист 2 (принтирай на гърба)" />
            <SheetPreview>
              {Array.from({ length: grid.total }).map((_, i) => {
                const col = i % grid.cols;
                const row = Math.floor(i / grid.cols);
                // Огледално отляво, за да съвпадне при обръщане на листа.
                const left = grid.offsetX + (grid.cols - 1 - col) * CARD.w;
                const top = grid.offsetY + row * CARD.h;
                return (
                  <div key={i} style={{ position: "absolute", left: `${left}mm`, top: `${top}mm` }}>
                    <CardBack s={s} theme={theme} u={mm} />
                  </div>
                );
              })}
            </SheetPreview>
          </>
        )}

        <ProjectFile
          state={s}
          filename="mastilko-vizitki"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })}
        />
      </div>
    </div>
  );
}
