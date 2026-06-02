import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../ui";
import "./table.css";

export type SeatPos = "bottom" | "top" | "left" | "right";

interface FeltTableProps {
  children: ReactNode;
  /** Per-game felt hue override (e.g. Santase candlelit, Bridge library). */
  feltColor?: string;
  feltDark?: string;
  crest?: string;
  className?: string;
  style?: CSSProperties;
}

/** The premium card-table stage (§3.1). Games place seats + center into it. */
export function FeltTable({ children, feltColor, feltDark, crest = "A", className, style }: FeltTableProps) {
  const vars: CSSProperties = {
    ...(feltColor ? ({ "--table-felt": feltColor } as CSSProperties) : {}),
    ...(feltDark ? ({ "--table-felt-dark": feltDark } as CSSProperties) : {}),
    ...style,
  };
  return (
    <div className={cn("aso-table", className)} style={vars}>
      <div className="aso-table__rail" aria-hidden />
      <div className="aso-table__felt">
        <span className="aso-table__crest" aria-hidden>
          {crest}
        </span>
        {children}
      </div>
    </div>
  );
}

interface SeatProps {
  pos: SeatPos;
  name: string;
  active?: boolean;
  /** Extra info under the name plate (score, chips). */
  badge?: ReactNode;
  children?: ReactNode;
}

/** A player position around the table: name plate + their card area. */
export function Seat({ pos, name, active, badge, children }: SeatProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="aso-seat" data-pos={pos}>
      {pos === "bottom" ? children : null}
      <div className="aso-seat__plate" data-active={active ? "true" : undefined}>
        <span className="aso-seat__avatar">{initial}</span>
        <span>{name}</span>
        {badge}
      </div>
      {pos !== "bottom" ? children : null}
    </div>
  );
}

/** The center play area (current trick / pot). */
export function TableCenter({ children }: { children: ReactNode }) {
  return <div className="aso-table__center">{children}</div>;
}
