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

const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface VoucherState extends StyleState {
  business: string;
  value: string;
  desc: string;
  validUntil: string;
  serialPrefix: string;
  serialStart: number;
  count: number;
  qrUrl: string;
  logo: string;
  themeId: string;
}

const INITIAL: VoucherState = {
  business: "Салон „Мечта“",
  value: "−20%",
  desc: "отстъпка за всяка услуга",
  validUntil: "валиден до 31.12.2026 г.",
  serialPrefix: "MECHTA",
  serialStart: 1,
  count: 8,
  qrUrl: "",
  logo: "",
  themeId: "tera",
};

const ProjectSchema = z
  .object({
    business: z.string().max(60),
    value: z.string().max(20),
    desc: z.string().max(80),
    validUntil: z.string().max(60),
    serialPrefix: z.string().max(20),
    serialStart: z.number().int().min(0).max(999999),
    count: z.number().int().min(1).max(60),
    qrUrl: z.string().max(300),
    logo: z.string().max(500000),
    ...StyleSchemaShape,
  })
  .partial();

const V = { w: 95, h: 55 };

function serialOf(s: VoucherState, i: number): string {
  const n = String(s.serialStart + i).padStart(3, "0");
  return s.serialPrefix ? `${s.serialPrefix}-${n}` : n;
}

function Voucher({ s, theme, serial, qrSrc }: { s: VoucherState; theme: WarmTheme; serial: string; qrSrc: string | null }) {
  return (
    <div style={{
      position: "relative", width: `${V.w}mm`, height: `${V.h}mm`,
      background: sheetBg(s, theme), color: theme.fg,
      border: `0.3mm dashed rgba(120,110,100,0.5)`, borderRadius: "2mm",
      overflow: "hidden", display: "flex",
    }}>
      {/* Ляв акцентен талон със стойността */}
      <div style={{
        width: "34mm", background: theme.accent, color: theme.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "2mm", flexShrink: 0,
      }}>
        <div style={{ fontFamily: elementFont(s, "value", "var(--font-display)"), fontWeight: 800, fontSize: fs(11), lineHeight: 1 }}>
          {s.value}
        </div>
        <div style={{ fontSize: fs(2.6), marginTop: "1.5mm", opacity: 0.95 }}>ВАУЧЕР</div>
      </div>
      {/* Дясна част */}
      <div style={{ flex: 1, padding: "3mm 4mm", display: "flex", flexDirection: "column", position: "relative" }}>
        {s.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo} alt="" style={{ position: "absolute", right: "3mm", top: "3mm", height: "9mm", maxWidth: "22mm", objectFit: "contain" }} />
        )}
        <div style={{ fontWeight: 800, fontSize: fs(4.4), color: theme.accent, maxWidth: "36mm" }}>{s.business}</div>
        <div style={{ fontSize: fs(3.4), marginTop: "1mm" }}>{s.desc}</div>
        <div style={{ fontSize: fs(2.8), opacity: 0.8, marginTop: "auto" }}>{s.validUntil}</div>
        <div style={{ fontSize: fs(2.8), fontWeight: 700, marginTop: "0.5mm" }}>Код: {serial}</div>
        {qrSrc && (
          <QrImage src={qrSrc} style={{ position: "absolute", right: "3mm", bottom: "3mm", width: "13mm", height: "13mm", background: "#fff", padding: "0.8mm", borderRadius: "1mm" }} />
        )}
      </div>
    </div>
  );
}

export default function VoucherStudio() {
  const [s, setS] = useLocalState<VoucherState>("mastilko-voucher", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<VoucherState>) => setS({ ...s, ...patch });

  const grid = sheetGrid(V.w, V.h, 8, 4, 4);
  const perSheet = Math.max(1, grid.total);
  const sheetsNeeded = Math.ceil(s.count / perSheet);
  const qrText = s.qrUrl.trim()
    ? /^https?:\/\//i.test(s.qrUrl.trim()) ? s.qrUrl.trim() : `https://${s.qrUrl.trim()}`
    : "";
  const qrSrc = useQrDataUrl(qrText);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          {([
            ["business", "Бизнес / фирма", "напр. Салон „Мечта“"],
            ["value", "Стойност (голям текст)", "напр. −20% или Подарък"],
            ["desc", "Описание", "напр. отстъпка за всяка услуга"],
            ["validUntil", "Валидност", "напр. валиден до 31.12.2026 г."],
          ] as const).map(([k, label, ph]) => (
            <div key={k}>
              <label htmlFor={`v-${k}`} className="field-label">{label}</label>
              <input id={`v-${k}`} className="field-input" maxLength={80} value={s[k]}
                onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="v-prefix" className="field-label">Префикс на кода</label>
              <input id="v-prefix" className="field-input" maxLength={20} value={s.serialPrefix}
                onChange={(e) => set({ serialPrefix: e.target.value })} placeholder="MECHTA" />
            </div>
            <div>
              <label htmlFor="v-count" className="field-label">Брой ваучери</label>
              <input id="v-count" type="number" min={1} max={60} className="field-input" value={s.count}
                onChange={(e) => set({ count: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
            </div>
          </div>
          <p className="text-xs text-ink-faint">
            Всеки ваучер получава уникален номер (напр. {serialOf(s, 0)}, {serialOf(s, 1)}…). {s.count} ваучера на {sheetsNeeded} листа.
          </p>
          <div>
            <label htmlFor="v-qr" className="field-label">QR код с линк (по избор — общ)</label>
            <input id="v-qr" className="field-input" maxLength={300} value={s.qrUrl}
              onChange={(e) => set({ qrUrl: e.target.value })} placeholder="напр. salonmechta.bg" />
          </div>
          <ImageUpload label="Лого (по избор)" value={s.logo} onChange={(logo) => set({ logo })} />
          <StyleControls value={s} onChange={set} hideBorder />
        </div>
        <ProjectFile state={s} filename="mastilko-voucher"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={`${s.count} ваучера на ${sheetsNeeded} листа А4`} />
        {Array.from({ length: sheetsNeeded }).map((_, sheetIdx) => {
          const start = sheetIdx * perSheet;
          const count = Math.min(perSheet, s.count - start);
          return (
            <SheetPreview key={sheetIdx} style={fontVars(s)}>
              {Array.from({ length: count }).map((_, i) => {
                const col = i % grid.cols;
                const row = Math.floor(i / grid.cols);
                const left = grid.offsetX + col * (V.w + grid.gapX);
                const top = grid.offsetY + row * (V.h + grid.gapY);
                return (
                  <div key={i} style={{ position: "absolute", left: `${left}mm`, top: `${top}mm` }}>
                    <Voucher s={s} theme={theme} serial={serialOf(s, start + i)} qrSrc={qrSrc} />
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
