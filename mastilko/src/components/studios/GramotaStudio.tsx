"use client";

import { z } from "zod";
import { resolveTheme, fontVars, elementFont, resolveDecor, sheetBg, borderCss, titleFx, photoFilterCss, StyleSchemaShape, type StyleState } from "@/lib/style";
import { useLocalState } from "@/lib/use-local-state";
import BackgroundDecor from "@/components/BackgroundDecor";
import FontPicker from "@/components/FontPicker";
import ImageUpload from "@/components/ImageUpload";
import PrintBar from "@/components/PrintBar";
import QrImage, { useQrDataUrl } from "@/components/QrImage";
import ProjectFile from "@/components/ProjectFile";
import SheetPreview from "@/components/SheetPreview";
import StyleControls from "@/components/StyleControls";

// Размер на текста с глобален мащаб (--sheet-scale); печатната математика в mm
// не се влияе — само размерите на шрифта се умножават.
const fs = (n: number) => `calc(var(--sheet-scale, 1) * ${n}mm)`;

interface GramotaState extends StyleState {
  kind: string;
  recipient: string;
  reason: string;
  org: string;
  place: string;
  date: string;
  signer: string;
  themeId: string;
  /** Лого/емблема (data URL) над заглавието. */
  logo: string;
  /** Размер на логото в mm. */
  logoSize: number;
  /** Кръгъл печат до подписа. */
  seal: boolean;
  /** Декоративна лента-розетка. */
  ribbon: boolean;
  /** QR код за проверка (линк/код). */
  verifyQr: boolean;
  /** Съдържание на проверовъчния QR (линк или код). */
  verifyCode: string;
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
  logo: "",
  logoSize: 18,
  seal: false,
  ribbon: false,
  verifyQr: false,
  verifyCode: "",
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
    logo: z.string().max(500000),
    logoSize: z.number().min(8).max(40),
    seal: z.boolean(),
    ribbon: z.boolean(),
    verifyQr: z.boolean(),
    verifyCode: z.string().max(300),
    ...StyleSchemaShape,
  })
  .partial();

const KINDS = ["ГРАМОТА", "СЕРТИФИКАТ", "ДИПЛОМА", "БЛАГОДАРСТВЕНО ПИСМО"];

/** Кръгъл печат (концентрични кръгове + звезда) — чист CSS, печата се. */
function Seal({ color }: { color: string }) {
  return (
    <div style={{ position: "relative", width: "26mm", height: "26mm" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1mm solid ${color}`, opacity: 0.9 }} />
      <div style={{ position: "absolute", inset: "2mm", borderRadius: "50%", border: `0.3mm solid ${color}`, opacity: 0.9 }} />
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", color, fontSize: "12mm", lineHeight: 1,
      }}>★</div>
    </div>
  );
}

/** Наградна лента-розетка — два триъгълни края + кръгъл медальон. */
function Ribbon({ color }: { color: string }) {
  return (
    <div style={{ position: "relative", width: "20mm", height: "30mm" }}>
      <div style={{ position: "absolute", left: "4mm", top: "12mm", width: "5mm", height: "18mm", background: color, opacity: 0.85, clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)" }} />
      <div style={{ position: "absolute", right: "4mm", top: "12mm", width: "5mm", height: "18mm", background: color, opacity: 0.85, clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)" }} />
      <div style={{ position: "absolute", left: "1mm", top: 0, width: "18mm", height: "18mm", borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9mm" }}>★</div>
    </div>
  );
}

export default function GramotaStudio() {
  const [s, setS] = useLocalState<GramotaState>("mastilko-gramota", INITIAL, (r) => ProjectSchema.parse(r));
  const theme = resolveTheme(s);
  const set = (patch: Partial<GramotaState>) => setS({ ...s, ...patch });
  const verifySrc = useQrDataUrl(s.verifyQr && s.verifyCode.trim() ? s.verifyCode.trim() : "");

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
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
          <div className="grid grid-cols-2 gap-2">
            <FontPicker label="Шрифт: заглавие" value={s.fonts?.kind} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, kind: id } })} />
            <FontPicker label="Шрифт: име" value={s.fonts?.recipient} allowDefault
              onChange={(id) => set({ fonts: { ...s.fonts, recipient: id } })} />
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

          <div className="space-y-3 border-t border-ink/10 pt-3">
            <ImageUpload label="Лого / емблема (по желание)" value={s.logo} onChange={(logo) => set({ logo })} />
            {s.logo && (
              <label className="block text-xs font-semibold text-ink-soft">
                <span className="flex items-baseline justify-between">
                  <span>Размер на логото</span>
                  <span className="tabular-nums text-ink-faint">{s.logoSize} mm</span>
                </span>
                <input type="range" min={8} max={40} step={1} value={s.logoSize}
                  onChange={(e) => set({ logoSize: Number(e.target.value) })}
                  className="mt-1 h-4 w-full accent-tera" aria-label="Размер на логото" />
              </label>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <input type="checkbox" checked={s.seal} onChange={(e) => set({ seal: e.target.checked })} className="h-4 w-4 accent-tera" />
                Печат
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <input type="checkbox" checked={s.ribbon} onChange={(e) => set({ ribbon: e.target.checked })} className="h-4 w-4 accent-tera" />
                Лента-розетка
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <input type="checkbox" checked={s.verifyQr} onChange={(e) => set({ verifyQr: e.target.checked })} className="h-4 w-4 accent-tera" />
                QR за проверка
              </label>
            </div>
            {s.verifyQr && (
              <div>
                <label htmlFor="verify-code" className="field-label">Линк/код за проверка</label>
                <input id="verify-code" className="field-input" maxLength={300} value={s.verifyCode}
                  onChange={(e) => set({ verifyCode: e.target.value })}
                  placeholder="напр. https://uchilishte.bg/proveri/2026-042" />
                <p className="mt-1 text-xs text-ink-faint">
                  QR кодът се генерира в твоя браузър — нищо не се изпраща навън.
                </p>
              </div>
            )}
          </div>

          <StyleControls value={s} onChange={set} showTitleFx showPhotoFx />
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
              flex: 1, ...borderCss(s, { width: 2, style: "solid", color: theme.accent, radius: 0 }),
              padding: "4mm", position: "relative",
            }}>
              <div style={{
                height: "100%", border: `0.5mm solid ${theme.accent}`,
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", textAlign: "center", padding: "10mm 18mm",
                color: theme.fg, background: sheetBg(s, theme), position: "relative", overflow: "hidden",
              }}>
                <BackgroundDecor decor={s.decor} {...resolveDecor(s, theme.accent)} />
                {s.ribbon && (
                  <div style={{ position: "absolute", top: "3mm", right: "5mm", zIndex: 2 }}>
                    <Ribbon color={theme.accent} />
                  </div>
                )}
                {verifySrc && (
                  <div style={{ position: "absolute", bottom: "5mm", left: "6mm", zIndex: 2, textAlign: "center" }}>
                    <QrImage src={verifySrc} style={{ width: "15mm", height: "15mm", background: "#fff", padding: "1mm", borderRadius: "1mm" }} />
                    <div style={{ fontSize: fs(2.4), marginTop: "0.5mm", opacity: 0.7 }}>проверка</div>
                  </div>
                )}
                {s.logo && (
                  <div style={{ marginBottom: "3mm", position: "relative", zIndex: 1 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logo} alt="" style={{ height: `${s.logoSize}mm`, maxWidth: "70mm", objectFit: "contain", display: "block", filter: photoFilterCss(s) }} />
                  </div>
                )}
                <div style={{ fontSize: fs(5), letterSpacing: "0.3em", color: theme.accent, fontWeight: 700, position: "relative", zIndex: 1 }}>
                  {s.org || " "}
                </div>
                <div style={{
                  fontFamily: elementFont(s, "kind", "var(--font-display)"), fontWeight: 800,
                  fontSize: fs(16), letterSpacing: "0.05em", marginTop: "4mm",
                  color: theme.accent, position: "relative", zIndex: 1, ...titleFx(s, theme),
                }}>
                  {s.kind}
                </div>
                <div style={{ fontSize: fs(4), marginTop: "6mm", position: "relative", zIndex: 1 }}>връчва се на</div>
                <div style={{
                  fontFamily: elementFont(s, "recipient", "var(--font-display)"), fontWeight: 800,
                  fontSize: fs(11), margin: "3mm 0", borderBottom: `0.4mm solid ${theme.accent}`,
                  paddingBottom: "2mm", minWidth: "60%", position: "relative", zIndex: 1,
                }}>
                  {s.recipient || "Име Фамилия"}
                </div>
                <div style={{ fontSize: fs(4.2), lineHeight: 1.5, maxWidth: "80%", marginTop: "3mm", position: "relative", zIndex: 1 }}>
                  {s.reason}
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", width: "100%",
                  marginTop: "auto", paddingTop: "12mm", fontSize: fs(3.6),
                  position: "relative", zIndex: 1,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: `0.3mm solid ${theme.fg}`, paddingTop: "1.5mm", minWidth: "45mm" }}>
                      {s.place}{s.place && s.date ? ", " : ""}{s.date}
                    </div>
                  </div>
                  {s.seal && (
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                      <Seal color={theme.accent} />
                    </div>
                  )}
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
