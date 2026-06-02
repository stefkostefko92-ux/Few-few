import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../ui";
import "./board.css";

/** Wooden-framed stage for board games (§4.7/§4.8). */
export function BoardFrame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn("aso-board", className)} style={style}>
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
  const on = new Set(PIP_MAP[value] ?? []);
  return (
    <span className={cn("aso-die", rolling && "aso-die--rolling")} aria-label={`зар ${value}`}>
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
