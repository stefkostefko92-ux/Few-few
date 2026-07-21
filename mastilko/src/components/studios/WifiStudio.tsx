"use client";

import { z } from "zod";
import { sheetGrid } from "@/lib/print";
import { resolveTheme, fontVars, elementFont, resolveDecor, sheetBg, borderCss, qrSafeColor, StyleSchemaShape, type StyleState } from "@/lib/style";
import { wifiQr, type WifiAuth } from "@/lib/wifi";
import { useLocalState } from "@/lib/use-local-state";
import BackgroundDecor from "@/components/BackgroundDecor";
import Icon from "@/components/Icon";
import PrintBar from "@/components/PrintBar";
import ProjectFile from "@/components/ProjectFile";
import QrImage, { useQrDataUrl } from "@/components/QrImage";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); печатната математика в mm
// не се влияе — само размерите на шрифта се умножават.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface WifiState extends StyleState {
  title: string;
  ssid: string;
  password: string;
  auth: WifiAuth;
  hidden: boolean;
  note: string;
  themeId: string;
  perSheet: number;
  /** Дял на QR кода спрямо стикера: 0.3 … 0.7. */
  qrScale: number;
}

const INITIAL: WifiState = {
  title: "WiFi",
  ssid: "",
  password: "",
  auth: "WPA",
  hidden: false,
  note: "Сканирай кода и се свързваш автоматично",
  themeId: "nebe",
  perSheet: 6,
  qrScale: 0.5,
};

const ProjectSchema = z
  .object({
    title: z.string().max(40),
    ssid: z.string().max(64),
    password: z.string().max(64),
    auth: z.enum(["WPA", "WEP", "nopass"]),
    hidden: z.boolean(),
    note: z.string().max(120),
    perSheet: z.number().int().min(1).max(12),
    qrScale: z.number().min(0.3).max(0.7),
    ...StyleSchemaShape,
  })
  .partial();

// Размерът на стикера според броя на лист (2/4/6/9 стикера).
const SIZES: Record<number, { w: number; h: number; cols: number }> = {
  2: { w: 95, h: 130, cols: 1 },
  4: { w: 95, h: 130, cols: 2 },
  6: { w: 90, h: 88, cols: 2 },
  9: { w: 62, h: 88, cols: 3 },
};

export default function WifiStudio() {
  const [s, setS] = useLocalState<WifiState>("mastilko-wifi", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<WifiState>) => setS({ ...s, ...patch });

  const size = SIZES[s.perSheet] ?? SIZES[6]!;
  const grid = sheetGrid(size.w, size.h, 8, 4, 6);
  const total = Math.min(grid.total, s.perSheet);
  const qrSrc = useQrDataUrl(s.ssid.trim() ? wifiQr(s) : "", s.qrColor ? qrSafeColor(theme.accent) : undefined);
  const confusable = /[0OIl1|]/.test(s.password);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <div className="card-warm space-y-4 p-5">
          <div>
            <label htmlFor="ssid" className="field-label">Име на мрежата (SSID)</label>
            <input id="ssid" className="field-input" maxLength={64} value={s.ssid}
              onChange={(e) => set({ ssid: e.target.value })} placeholder="напр. Cafe_Mechta" />
          </div>
          <div>
            <label htmlFor="wauth" className="field-label">Защита</label>
            <select id="wauth" className="field-input" value={s.auth}
              onChange={(e) => set({ auth: e.target.value as WifiAuth })}>
              <option value="WPA">WPA/WPA2/WPA3 (парола)</option>
              <option value="WEP">WEP (стара парола)</option>
              <option value="nopass">Отворена (без парола)</option>
            </select>
          </div>
          {s.auth !== "nopass" && (
            <div>
              <label htmlFor="wpass" className="field-label">Парола</label>
              <input id="wpass" className="field-input" maxLength={64} value={s.password}
                onChange={(e) => set({ password: e.target.value })} placeholder="паролата на мрежата" />
              <p className="mt-1 text-xs text-ink-faint">
                Паролата влиза само в QR кода, генериран в твоя браузър — не се
                изпраща никъде.
              </p>
              {confusable && (
                <p className="mt-1 text-xs font-semibold text-tera-dark">
                  Паролата съдържа лесно объркващи знаци (0/O, l/1/I) — равноширокият
                  шрифт на стикера ги разграничава ясно.
                </p>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={s.hidden}
              onChange={(e) => set({ hidden: e.target.checked })} className="h-4 w-4 accent-tera" />
            Скрита мрежа
          </label>
          <div>
            <label htmlFor="wtitle" className="field-label">Заглавие</label>
            <input id="wtitle" className="field-input" maxLength={40} value={s.title}
              onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="wnote" className="field-label">Долен текст</label>
            <input id="wnote" className="field-input" maxLength={120} value={s.note}
              onChange={(e) => set({ note: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            Стикери на лист:
            <select className="field-input !w-24" value={s.perSheet}
              onChange={(e) => set({ perSheet: Number(e.target.value) })}>
              {[2, 4, 6, 9].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-soft">
            <span className="flex items-baseline justify-between">
              <span>Размер на QR кода</span>
              <span className="tabular-nums text-ink-faint">{Math.round(s.qrScale * 100)}%</span>
            </span>
            <input type="range" min={0.3} max={0.7} step={0.05} value={s.qrScale}
              onChange={(e) => set({ qrScale: Number(e.target.value) })}
              className="mt-1 h-4 w-full accent-tera" aria-label="Размер на QR кода" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={!!s.qrColor}
              onChange={(e) => set({ qrColor: e.target.checked })} className="h-4 w-4 accent-tera" />
            QR в акцентния цвят (ако е скенируем)
          </label>
          <StyleControls value={s} onChange={set} />
        </div>

        <p className="text-xs text-ink-faint">
          <Icon name="bulb" className="mr-1 h-4 w-4 align-[-3px]" /> Съвет: разлепен стикер с паролата е достъпен за всеки, който вижда
          листа — за заведения ползвай отделна гост-мрежа.
        </p>
        <ProjectFile state={s} filename="mastilko-wifi"
          onLoad={(data) => setS({ ...INITIAL, ...ProjectSchema.parse(data) })} />
      </div>

      <div className="space-y-4">
        <PrintBar summary={`${total} WiFi стикера на лист А4`} />
        <SheetPreview style={fontVars(s)}>
          {Array.from({ length: total }).map((_, i) => {
            const col = i % size.cols;
            const row = Math.floor(i / size.cols);
            const left = grid.offsetX + col * (size.w + grid.gapX);
            const top = grid.offsetY + row * (size.h + grid.gapY);
            return (
              <div key={i} style={{
                position: "absolute", left: `${left}mm`, top: `${top}mm`,
                width: `${size.w}mm`, height: `${size.h}mm`,
                background: sheetBg(s, theme), color: theme.fg,
                ...borderCss(s, { width: 0.3, style: "dashed", color: "rgba(120,110,100,0.5)", radius: 3 }), overflow: "hidden",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", textAlign: "center", padding: "4mm", gap: "2mm",
              }}>
                <BackgroundDecor decor={s.decor} {...resolveDecor(s, theme.accent)} />
                <div style={{ fontWeight: 800, fontSize: fs(5), fontFamily: elementFont(s, "title", "var(--font-display)"), position: "relative", zIndex: 1 }}>
                  📶 {s.title || "WiFi"}
                </div>
                {qrSrc && <QrImage src={qrSrc} style={{ width: `${Math.min(size.w, size.h) * s.qrScale}mm`, height: `${Math.min(size.w, size.h) * s.qrScale}mm`, background: "#fff", padding: "1.5mm", borderRadius: "1.5mm" }} />}
                <div style={{ fontSize: fs(3.2), wordBreak: "break-all" }}>
                  <strong>Мрежа:</strong> {s.ssid || "…"}
                </div>
                {s.auth !== "nopass" && (
                  <div style={{ fontSize: fs(3.2), wordBreak: "break-all" }}>
                    <strong>Парола:</strong>{" "}
                    <span style={{ fontFamily: "var(--font-jetbrains)" }}>{s.password || "…"}</span>
                  </div>
                )}
                {s.note && <div style={{ fontSize: fs(2.6), opacity: 0.8 }}>{s.note}</div>}
              </div>
            );
          })}
        </SheetPreview>
      </div>
    </div>
  );
}
