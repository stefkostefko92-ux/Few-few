import { SuitGlyph, type SuitChar } from "./suits";

/**
 * Trump indicator pinned to the top-left of a table: a small brass-framed card
 * showing the trump suit, with a label above it. Shared by all games with a
 * trump (Белот, Сантасе, Бридж). For No-Trump contracts pass `suit={null}`.
 */
export function TrumpIndicator({
  suit,
  label,
  noTrumpText,
}: {
  suit: SuitChar | null;
  label: string;
  /** Shown on the card face when there is no trump suit (e.g. Bridge NT). */
  noTrumpText?: string;
}) {
  const red = suit === "H" || suit === "D";
  const color = red ? "var(--suit-red)" : "var(--suit-black)";
  return (
    <div className="aso-trump">
      <span className="aso-trump__label">{label}</span>
      <span className="aso-trump__card">
        {suit ? (
          <SuitGlyph suit={suit} size={34} color={color} />
        ) : (
          <span className="aso-trump__nt">{noTrumpText ?? "NT"}</span>
        )}
      </span>
    </div>
  );
}
