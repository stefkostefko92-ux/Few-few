import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { clampSpin } from "@aso/shared";

export interface Spin {
  /** −1..1 — вляво/вдясно от центъра спрямо посоката на удара. */
  x: number;
  /** −1..1 — долу (draw) / горе (follow). */
  y: number;
}

const STEP = 0.1;
const snap = (v: number): number => Math.round(v * 100) / 100;

/**
 * Малката „бяла топка“ за избор на точката на удара (ефект). Влачене с мишка
 * или пръст, стрелки от клавиатурата (Shift = по-фино), Home/0 = център.
 * Пунктираният кръг е позволеният радиус — по-навън е „miscue“ и точката се
 * задържа на ръба му (същата нормализация като в двигателя).
 */
export function SpinPad({
  value,
  onChange,
  disabled,
}: {
  value: Spin;
  onChange: (s: Spin) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const set = (x: number, y: number) => {
    const c = clampSpin(x, y);
    onChange({ x: snap(c.spinX), y: snap(c.spinY) });
  };

  function fromPointer(e: React.PointerEvent) {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    // viewBox −1.25..1.25; позволеният радиус = 1. Екранното „горе“ е +y на ефекта.
    const x = ((e.clientX - r.left) / r.width) * 2.5 - 1.25;
    const y = -(((e.clientY - r.top) / r.height) * 2.5 - 1.25);
    set(x, y);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    const d = e.shiftKey ? STEP / 2 : STEP;
    let { x, y } = value;
    switch (e.key) {
      case "ArrowUp":
        y += d;
        break;
      case "ArrowDown":
        y -= d;
        break;
      case "ArrowLeft":
        x -= d;
        break;
      case "ArrowRight":
        x += d;
        break;
      case "Home":
      case "0":
        x = 0;
        y = 0;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    set(x, y);
  }

  const pct = (v: number) => Math.round(Math.abs(v) * 100);
  const parts: string[] = [];
  if (value.y !== 0) parts.push(`${value.y > 0 ? t("cue.spinTop") : t("cue.spinBottom")} ${pct(value.y)} %`);
  if (value.x !== 0) parts.push(`${value.x > 0 ? t("cue.spinRight") : t("cue.spinLeft")} ${pct(value.x)} %`);
  const valueText = parts.length ? parts.join(", ") : t("cue.spinCenter");
  const centred = value.x === 0 && value.y === 0;

  return (
    <div className="aso-cue__spin">
      <svg
        ref={ref}
        className="aso-cue__spinpad"
        viewBox="-1.25 -1.25 2.5 2.5"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t("cue.spin")}
        aria-roledescription={t("cue.spinRole")}
        aria-valuetext={valueText}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value.y * 100)}
        aria-disabled={disabled || undefined}
        aria-describedby="aso-cue-spin-help"
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current && !disabled) fromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onDoubleClick={() => !disabled && set(0, 0)}
      >
        <title>{valueText}</title>
        <defs>
          <radialGradient id="asoSpinBall" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#ece6d6" />
            <stop offset="100%" stopColor="#b9b2a0" />
          </radialGradient>
        </defs>
        <circle r={1.2} fill="url(#asoSpinBall)" stroke="rgba(0,0,0,.45)" strokeWidth={0.04} />
        {/* позволен радиус (по-навън — miscue) */}
        <circle r={1} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={0.03} strokeDasharray="0.08 0.08" />
        <line x1={-1} y1={0} x2={1} y2={0} stroke="rgba(0,0,0,.14)" strokeWidth={0.02} />
        <line x1={0} y1={-1} x2={0} y2={1} stroke="rgba(0,0,0,.14)" strokeWidth={0.02} />
        <circle cx={value.x} cy={-value.y} r={0.2} fill="#c0241f" stroke="#fff" strokeWidth={0.05} />
      </svg>
      <div className="aso-cue__spinmeta">
        <span className="text-sm text-ink-muted">{t("cue.spin")}</span>
        <span className="text-xs text-ink-300" aria-hidden="true">
          {valueText}
        </span>
        <button
          type="button"
          className="aso-cue__spinreset"
          onClick={() => set(0, 0)}
          disabled={disabled || centred}
        >
          {t("cue.spinReset")}
        </button>
        <span id="aso-cue-spin-help" className="sr-only">
          {t("cue.spinHelp")}
        </span>
      </div>
    </div>
  );
}
