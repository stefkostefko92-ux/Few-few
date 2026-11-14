import { POCKETS, TABLE } from "@aso/shared";
import { useTranslation } from "react-i18next";
import { feltOnScreen, pocketForSlot } from "./cueControls";

/** Топка за умалената маса — вече оцветена от изгледа. */
export interface MiniBall {
  id: number;
  x: number;
  y: number;
  color: string;
  stripe: boolean;
}

/** Рамка около сукното в единиците на масата (джобовете стърчат в нея). */
const PAD = 0.09;

/**
 * Умалена маса В прозореца за решение (обявен джоб, push-out, избор след фал).
 * Прозорецът неизбежно ляга върху част от истинската маса — затова решението
 * носи цялото разположение със себе си: всички топки, джобовете и (при
 * обявяване) самите джобове като бутони на местата им.
 *
 * Рисува се ТОЧНО както играчът вижда масата: 3D камерата гледа от далечния
 * дълъг борд (картината е 2D, завъртяна на 180°), затова при `rotated`
 * топките са огледални по двете оси, а бутонът на екранно място k обявява
 * джоб `pocketForSlot(k, true)` — същото правило като кликът по масата.
 */
export function DecisionTable({
  balls,
  cloth,
  rotated,
  ring,
  onPocket,
}: {
  balls: MiniBall[];
  cloth: { a: string; b: string };
  rotated: boolean;
  /** Топка, която се огражда (осмицата при обявяване на джоб). */
  ring?: number;
  /** Обявяване на джоб: бутон на всеки джоб; без него масата е само за гледане. */
  onPocket?: (pocket: number) => void;
}) {
  const { t } = useTranslation();
  const W = TABLE.w;
  const H = TABLE.h;
  const screen = (x: number, y: number): [number, number] => {
    const p = feltOnScreen(x, y, rotated);
    return [p.x, p.y];
  };
  // Мащабът на топките е увеличен: в истински размер на 18rem маса са по 4px.
  const r = TABLE.ballR * 1.35;
  const pct = (v: number, span: number) => `${((v + PAD) / (span + 2 * PAD)) * 100}%`;

  return (
    <div className="aso-cue-mini" data-decision-table={rotated ? "3d" : "2d"}>
      <div className="aso-cue-mini__frame">
        <svg
          className="aso-cue-mini__svg"
          viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="asoCueMiniCloth" cx="40%" cy="35%" r="80%">
              <stop offset="0%" stopColor={cloth.a} />
              <stop offset="100%" stopColor={cloth.b} />
            </radialGradient>
          </defs>
          <rect
            x={-PAD}
            y={-PAD}
            width={W + 2 * PAD}
            height={H + 2 * PAD}
            rx={0.07}
            fill="#3a2616"
          />
          <rect
            x={-0.012}
            y={-0.012}
            width={W + 0.024}
            height={H + 0.024}
            rx={0.02}
            fill="#d9b25f"
            opacity={0.7}
          />
          <rect x={0} y={0} width={W} height={H} fill="url(#asoCueMiniCloth)" />
          {POCKETS.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={TABLE.pocketR} fill="#0a0a0a" />
          ))}
          {balls.map((b) => {
            const [x, y] = screen(b.x, b.y);
            return (
              <g key={b.id} data-mini-ball={b.id}>
                {b.id === ring ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={r * 1.9}
                    fill="none"
                    stroke="#f2cf7a"
                    strokeWidth={0.014}
                  />
                ) : null}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={b.stripe ? "#f4f1e8" : b.color}
                  stroke={b.stripe ? b.color : "rgba(0,0,0,.45)"}
                  strokeWidth={b.stripe ? r * 0.55 : 0.005}
                />
              </g>
            );
          })}
        </svg>
        {onPocket ? (
          <div className="aso-cue-mini__pockets" role="group" aria-label={t("cue.callPocket")}>
            {/* Бутоните са по ЕКРАННО място (горе вляво … долу вдясно). */}
            {POCKETS.map(([sx, sy], slot) => {
              const pocket = pocketForSlot(slot, rotated);
              return (
                <button
                  key={slot}
                  type="button"
                  className="aso-cue-mini__pocket"
                  style={{ left: pct(sx, W), top: pct(sy, H) }}
                  data-pocket={pocket}
                  aria-label={t(`cue.pockets.${slot}`)}
                  title={t(`cue.pockets.${slot}`)}
                  onClick={() => onPocket(pocket)}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
