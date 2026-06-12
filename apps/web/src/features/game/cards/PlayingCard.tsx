import { memo } from "react";
import { useParams } from "react-router-dom";
import { isGameKey } from "@aso/shared";
import { cn } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { SuitGlyph, isRed, type SuitChar } from "./suits";
import { PIP_LAYOUTS, RANK_LABEL } from "./pips";

export interface PlayingCardProps {
  /** Card id like "AS", "TH", "9D"; "?" for face-down. */
  card: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const SIZES = {
  sm: { w: 60, h: 84 },
  md: { w: 88, h: 124 },
  lg: { w: 120, h: 168 },
} as const;

/** Corner index: rank over a small suit glyph (drawn twice, rotated). */
function CornerIndex({ rank, suit, color, glyph }: { rank: string; suit: SuitChar; color: string; glyph: number }) {
  const label = RANK_LABEL[rank] ?? rank;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.78 }}>
      <span
        style={{
          color,
          fontWeight: 800,
          fontFamily: "var(--font-body)",
          fontSize: label.length > 1 ? "0.82em" : "1em",
          letterSpacing: label.length > 1 ? "-0.05em" : 0,
        }}
      >
        {label}
      </span>
      <SuitGlyph suit={suit} size={glyph} color={color} />
    </div>
  );
}

/**
 * A premium playing card rendered as crisp SVG/DOM (vector suits, classic pip
 * layouts, ornate court/ace treatment, brass-patterned back). Built to scale
 * cleanly and animate via transforms (GSAP) without re-rendering React.
 */
export const PlayingCard = memo(function PlayingCard({
  card,
  size = "md",
  selected,
  dimmed,
  onClick,
  className,
  style,
}: PlayingCardProps) {
  const { w, h } = SIZES[size];
  const cornerGlyph = size === "lg" ? 15 : size === "md" ? 11 : 8;
  const { game } = useParams<{ game: string }>();
  const key = game?.toUpperCase();
  const cardBack = useEquippedCosmetic(key && isGameKey(key) ? key : null, "CARDBACK");
  const faceDown = card === "?";
  const suit = (card[card.length - 1] ?? "S") as SuitChar;
  const rank = card.slice(0, card.length - 1);
  const color = faceDown ? "transparent" : isRed(suit) ? "var(--suit-red)" : "var(--suit-black)";
  const Tag = onClick ? "button" : "div";

  const isCourt = rank === "J" || rank === "Q" || rank === "K";
  const isAce = rank === "A";
  const pips = PIP_LAYOUTS[rank];

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={faceDown ? "карта" : `${RANK_LABEL[rank]}${suit}`}
      className={cn("aso-card", selected && "aso-card--selected", className)}
      style={{
        width: w,
        height: h,
        ...style,
      }}
      data-size={size}
      data-dimmed={dimmed ? "true" : undefined}
    >
      {faceDown ? (
        <span
          className="aso-card__back"
          aria-hidden
          style={
            cardBack
              ? ({ "--cb-a": cardBack.colors.a, "--cb-b": cardBack.colors.b } as React.CSSProperties)
              : undefined
          }
        />
      ) : (
        <span className="aso-card__face" style={{ color }}>
          {/* corners */}
          <span className="aso-card__corner aso-card__corner--tl">
            <CornerIndex rank={rank} suit={suit} color={color} glyph={cornerGlyph} />
          </span>
          <span className="aso-card__corner aso-card__corner--br">
            <CornerIndex rank={rank} suit={suit} color={color} glyph={cornerGlyph} />
          </span>

          {/* center */}
          {isAce ? (
            <span className="aso-card__center">
              <SuitGlyph suit={suit} size={size === "lg" ? 62 : size === "md" ? 47 : 32} color={color} />
            </span>
          ) : isCourt ? (
            <CourtArt rank={rank} suit={suit} color={color} size={size} />
          ) : pips ? (
            <span className="aso-card__pips">
              {pips.map((pip, i) => (
                <span
                  key={i}
                  className="aso-card__pip"
                  style={{
                    left: `${pip.x * 100}%`,
                    top: `${pip.y * 100}%`,
                    transform: `translate(-50%,-50%) rotate(${pip.flip ? 180 : 0}deg)`,
                  }}
                >
                  <SuitGlyph suit={suit} size={size === "lg" ? 20 : size === "md" ? 15 : 11} color={color} />
                </span>
              ))}
            </span>
          ) : null}
        </span>
      )}
    </Tag>
  );
});

/** Stylised court card: a brass-framed monogram with the suit — ar-deco feel. */
function CourtArt({
  rank,
  suit,
  color,
  size,
}: {
  rank: string;
  suit: SuitChar;
  color: string;
  size: "sm" | "md" | "lg";
}) {
  const mono = size === "lg" ? 40 : size === "md" ? 30 : 22;
  return (
    <span className="aso-card__court">
      <span className="aso-card__court-frame" aria-hidden />
      <span className="aso-card__court-mono" style={{ color, fontSize: mono }}>
        {RANK_LABEL[rank]}
      </span>
      <SuitGlyph suit={suit} size={size === "lg" ? 26 : 20} color={color} />
    </span>
  );
}
