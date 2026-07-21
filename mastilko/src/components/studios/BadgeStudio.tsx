"use client";

import { z } from "zod";
import { sheetGrid } from "@/lib/print";
import { resolveTheme, fontVars, elementFont, sheetBg, StyleSchemaShape, type StyleState } from "@/lib/style";
import { type WarmTheme } from "@/lib/themes";
import { useLocalState } from "@/lib/use-local-state";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import QrImage, { useQrDataUrl } from "@/components/QrImage";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); печатната математика в mm
// не се влияе — само размерите на шрифта се умножават.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface BadgeState extends StyleState {
  eventName: string;
  name: string;
  role: string;
  company: string;
  logo: string;
  logoSize: number;
  qrUrl: string;
  size: "standard" | "large";
  /** Серия: „Име | роля | фирма“ на ред → бадж за всеки гост. */
  series: string;
  themeId: string;
}

const INITIAL: BadgeState = {
  eventName: "КОНФЕРЕНЦИЯ 2026",
  name: "Иван Петров",
  role: "Лектор",
  company: "Мечта ООД",
  logo: "",
  logoSize: 14,
  qrUrl: "",
  size: "standard",
  series: "",
  themeId: "nebe",
};

const ProjectSchema = z
  .object({
    eventName: z.string().max(60),
    name: z.string().max(60),
    role: z.string().max(60),
    company: z.string().max(60),
    logo: z.string().max(500000),
    logoSize: z.number().min(8).max(30),
    qrUrl: z.string().max(300),
    size: z.enum(["standard", "large"]),
    series: z.string().max(6000),
    ...StyleSchemaShape,
  })
  .partial();

const SIZES: Record<BadgeState["size"], { w: number; h: number }> = {
  standard: { w: 90, h: 55 },
  large: { w: 100, h: 70 },
};

interface Guest { name: string; role: string; company: string }

function parseGuest(line: string, fallback: BadgeState): Guest {
  const [n, r, c] = line.split("|").map((x) => x.trim());
  return {
    name: n || fallback.name,
    role: r ?? fallback.role,
    company: c ?? fallback.company,
  };
}

function Badge({
  s,
  theme,
  guest,
  qrSrc,
  w,
  h,
}: {
  s: BadgeState;
  theme: WarmTheme;
  guest: Guest;
  qrSrc: string | null;
  w: number;
  h: number;
}) {
  return (
    <div style={{
      position: "relative",
      width: `${w}mm`,
      height: `${h}mm`,
      background: sheetBg(s, theme),
      color: theme.fg,
      border: `0.3mm dashed rgba(120,110,100,0.5)`,
      borderRadius: "2mm",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Горна акцентна лента със събитието + лого */}
      <div style={{
        background: theme.accent,
        color: theme.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "2mm",
        padding: "2mm 4mm",
      }}>
        <span style={{ fontSize: fs(3.2), fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.eventName}
        </span>
        {s.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo} alt="" style={{ height: `${Math.min(s.logoSize, h * 0.18)}mm`, maxWidth: "30mm", objectFit: "contain", display: "block" }} />
        )}
      </div>
      {/* Тяло: голямо име + роля/фирма */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "3mm 5mm",
        gap: "1.5mm",
        position: "relative",
      }}>
        <div style={{ fontFamily: elementFont(s, "name", "var(--font-display)"), fontWeight: 800, fontSize: fs(guest.name.length > 18 ? 7 : 9), lineHeight: 1.1 }}>
          {guest.name}
        </div>
        {guest.role && (
          <div style={{ fontSize: fs(4), fontWeight: 700, color: theme.accent }}>{guest.role}</div>
        )}
        {guest.company && (
          <div style={{ fontSize: fs(3.4), opacity: 0.85 }}>{guest.company}</div>
        )}
        {qrSrc && (
          <QrImage src={qrSrc} style={{ position: "absolute", right: "3mm", bottom: "3mm", width: "12mm", height: "12mm", background: "#fff", padding: "0.8mm", borderRadius: "1mm" }} />
        )}
      </div>
    </div>
  );
}

export default function BadgeStudio() {
  const [s, setS] = useLocalState<BadgeState>("mastilko-badge", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<BadgeState>) => setS({ ...s, ...patch });

  const size = SIZES[s.size];
  const grid = sheetGrid(size.w, size.h, 8, 4, 4);
  const qrText = s.qrUrl.trim()
    ? /^https?:\/\//i.test(s.qrUrl.trim()) ? s.qrUrl.trim() : `https://${s.qrUrl.trim()}`
    : "";
  const qrSrc = useQrDataUrl(qrText);

  const lines = s.series.split("\n").map((l) => l.trim()).filter(Boolean);
  const guests: Guest[] =
    lines.length > 0
      ? lines.map((l) => parseGuest(l, s))
      : [{ name: s.name, role: s.role, company: s.company }];

  // Колко баджа наистина се печатат: серия → всички (на страници), иначе цял лист.
  const perSheet = Math.max(1, grid.total);
  const sheetsNeeded = lines.length > 0 ? Math.ceil(guests.length / perSheet) : 1;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="b-event" className="field-label">Име на събитието</label>
            <input id="b-event" className="field-input" maxLength={60} value={s.eventName}
              onChange={(e) => set({ eventName: e.target.value })} placeholder="напр. КОНФЕРЕНЦИЯ 2026" />
          </div>
          {([
            ["name", "Име", "Иван Петров"],
            ["role", "Роля / позиция", "напр. Лектор"],
            ["company", "Фирма / организация", "напр. Мечта ООД"],
          ] as const).map(([k, label, ph]) => (
            <div key={k}>
              <label htmlFor={`b-${k}`} className="field-label">{label}</label>
              <input id={`b-${k}`} className="field-input" maxLength={60} value={s[k]}
                onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} disabled={lines.length > 0} />
            </div>
          ))}

          <div>
            <label htmlFor="b-series" className="field-label">
              Списък гости — „Име | роля | фирма“ на ред
            </label>
            <textarea id="b-series" className="field-input min-h-28" maxLength={6000} value={s.series}
              onChange={(e) => set({ series: e.target.value })}
              placeholder={"Иван Петров | Лектор | Мечта ООД\nМария Георгиева | Гост\nГеорги Иванов | Организатор | АСО"} />
            <p className="mt-1 text-xs text-ink-faint">
              {lines.length > 0
                ? `Ще се отпечатат ${guests.length} баджа на ${sheetsNeeded} листа (${perSheet} на лист). Ролята и фирмата са по избор след „|“.`
                : "Остави празно за един бадж. Всеки ред става отделен бадж."}
            </p>
          </div>

          <div>
            <label htmlFor="b-size" className="field-label">Размер</label>
            <select id="b-size" className="field-input" value={s.size}
              onChange={(e) => set({ size: e.target.value as BadgeState["size"] })}>
              <option value="standard">Стандартен (90 × 55 mm)</option>
              <option value="large">Голям (100 × 70 mm)</option>
            </select>
          </div>

          <div>
            <label htmlFor="b-qr" className="field-label">QR код с линк (по избор — един за всички)</label>
            <input id="b-qr" className="field-input" maxLength={300} value={s.qrUrl}
              onChange={(e) => set({ qrUrl: e.target.value })} placeholder="напр. sabitie.bg/programa" />
            <p className="mt-1 text-xs text-ink-faint">Генерира се в браузъра — нищо не се изпраща навън.</p>
          </div>

          <div className="space-y-3 border-t border-ink/10 pt-3">
            <ImageUpload label="Лого на събитието (по избор)" value={s.logo} onChange={(logo) => set({ logo })} />
            {s.logo && (
              <label className="block text-xs font-semibold text-ink-soft">
                <span className="flex items-baseline justify-between">
                  <span>Размер на логото</span>
                  <span className="tabular-nums text-ink-faint">{s.logoSize} mm</span>
                </span>
                <input type="range" min={8} max={30} step={1} value={s.logoSize}
                  onChange={(e) => set({ logoSize: Number(e.target.value) })}
                  className="mt-1 h-4 w-full accent-tera" aria-label="Размер на логото" />
              </label>
            )}
          </div>

          <StyleControls value={s} onChange={set} hideDecor hideBorder />
        </div>
        <ProjectFile state={s} filename="mastilko-badge"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={lines.length > 0
          ? `${guests.length} баджа на ${sheetsNeeded} листа А4`
          : `Баджове (${perSheet} на лист А4)`} />
        {Array.from({ length: sheetsNeeded }).map((_, sheetIdx) => {
          const start = lines.length > 0 ? sheetIdx * perSheet : 0;
          const count = lines.length > 0 ? Math.min(perSheet, guests.length - start) : perSheet;
          return (
            <SheetPreview key={sheetIdx} style={fontVars(s)}>
              {Array.from({ length: count }).map((_, i) => {
                const cell = i;
                const col = cell % grid.cols;
                const row = Math.floor(cell / grid.cols);
                const left = grid.offsetX + col * (size.w + grid.gapX);
                const top = grid.offsetY + row * (size.h + grid.gapY);
                const guest = lines.length > 0 ? guests[start + i]! : guests[0]!;
                return (
                  <div key={i} style={{ position: "absolute", left: `${left}mm`, top: `${top}mm` }}>
                    <Badge s={s} theme={theme} guest={guest} qrSrc={qrSrc} w={size.w} h={size.h} />
                  </div>
                );
              })}
            </SheetPreview>
          );
        })}
      </div>
    </div>
  );
}
