"use client";

import { CARD, cardGrid } from "@/lib/print";
import { themeById, type WarmTheme } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import AiAssist from "@/components/AiAssist";
import PrintBar from "@/components/PrintBar";
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
};

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

function CardFace({
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
          {initials || "М"}
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
            {initials || "М"}
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
              <CardFace s={s} theme={theme} u={px} />
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
                <CardFace s={s} theme={theme} u={mm} />
              </div>
            );
          })}
        </SheetPreview>
      </div>
    </div>
  );
}
