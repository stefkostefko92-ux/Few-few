import { memo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      aria-label={faceDown ? t("a11y.card") : `${RANK_LABEL[rank]}${suit}`}
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

/** One half of a two-headed art-deco court figure (line art, suit-tinted). */
function CourtMotif({ rank, suit, color }: { rank: string; suit: SuitChar; color: string }) {
  return (
    <g stroke={color} fill="none" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
      {rank === "K" ? (
        <>
          {/* crown: three rays + tip orbs + jewelled band */}
          <path d="M27 42 L27 16 L39 34 L50 10 L61 34 L73 16 L73 42 Z" />
          <circle cx="27" cy="13" r="3" fill={color} stroke="none" />
          <circle cx="50" cy="7" r="3.4" fill={color} stroke="none" />
          <circle cx="73" cy="13" r="3" fill={color} stroke="none" />
          <path d="M27 42 H73 V50 H27 Z" />
          <path d="M50 43 l5 3.5 -5 3.5 -5 -3.5 Z" fill={color} stroke="none" />
        </>
      ) : rank === "Q" ? (
        <>
          {/* art-deco fan + diadem orbs */}
          <path d="M18 50 A32 32 0 0 1 82 50" />
          <path d="M31 50 A19 19 0 0 1 69 50" />
          <path d="M50 50 L50 18 M50 50 L30 25 M50 50 L70 25 M50 50 L21 38 M50 50 L79 38" />
          <circle cx="50" cy="15" r="3" fill={color} stroke="none" />
          <circle cx="27" cy="22" r="2.6" fill={color} stroke="none" />
          <circle cx="73" cy="22" r="2.6" fill={color} stroke="none" />
        </>
      ) : (
        <>
          {/* halberd + plumed cap */}
          <path d="M30 50 L66 12" />
          <path d="M66 12 L82 20 L62 28 Z" fill={color} stroke="none" />
          <path d="M56 26 L72 34" strokeWidth={2.6} />
          <path d="M22 30 A20 20 0 0 1 50 16" strokeWidth={2.6} />
          <path d="M24 24 l-5 -7 M31 20 l-3 -8 M39 17 l-1 -8" strokeWidth={2.2} />
        </>
      )}
      <g transform="translate(41,54) scale(0.18)">
        <SuitGlyph suit={suit} size={100} color={color} />
      </g>
    </g>
  );
}

/** Two-headed art-deco court figure (crown/fan/halberd line art, like real
 *  mirrored courts) inside the brass frame — replaces the plain monogram. */
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
  void size; // the SVG scales with the frame
  return (
    <span className="aso-card__court">
      <span className="aso-card__court-frame" aria-hidden />
      <svg viewBox="0 0 100 148" style={{ position: "relative", zIndex: 1, width: "84%", height: "92%" }} aria-hidden>
        <CourtMotif rank={rank} suit={suit} color={color} />
        <g transform="rotate(180 50 74)">
          <CourtMotif rank={rank} suit={suit} color={color} />
        </g>
        <line x1="16" y1="74" x2="84" y2="74" stroke={color} strokeWidth={1.4} opacity={0.45} />
      </svg>
    </span>
  );
}
