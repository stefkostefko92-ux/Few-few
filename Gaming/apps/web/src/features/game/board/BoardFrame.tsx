import type { CSSProperties, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isGameKey } from "@aso/shared";
import { cn } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import "./board.css";

/** Wooden-framed stage for board games (§4.7/§4.8). An equipped BOARD cosmetic
 *  for the current game recolours the squares via --sq-light / --sq-dark. */
export function BoardFrame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { game } = useParams<{ game: string }>();
  const key = game?.toUpperCase();
  const board = useEquippedCosmetic(key && isGameKey(key) ? key : null, "BOARD");
  const vars: CSSProperties = board
    ? ({ "--sq-light": board.colors.a, "--sq-dark": board.colors.b, ...style } as CSSProperties)
    : (style ?? {});
  return (
    <div className={cn("aso-board", className)} style={vars}>
      <div className="aso-board__inner">{children}</div>
    </div>
  );
}

const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** A single pipped die (1..6). */
export function Die({ value, rolling }: { value: number; rolling?: boolean }) {
  const { t } = useTranslation();
  const on = new Set(PIP_MAP[value] ?? []);
  return (
    <span className={cn("aso-die", rolling && "aso-die--rolling")} aria-label={t("a11y.die", { v: value })}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={cn("aso-pip", !on.has(i) && "aso-pip--off")} />
      ))}
    </span>
  );
}

/** A row of dice. */
export function DiceRow({ values, rolling }: { values: number[]; rolling?: boolean }) {
  return (
    <span className="aso-dice">
      {values.map((v, i) => (
        <Die key={i} value={v} rolling={rolling} />
      ))}
    </span>
  );
}
