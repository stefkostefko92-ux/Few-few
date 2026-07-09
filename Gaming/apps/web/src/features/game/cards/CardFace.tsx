import { cn } from "../../../ui";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

interface Props {
  /** Card id like "AS", "TH", "9D", or "?" for a face-down card. */
  card: string;
  selected?: boolean;
  playable?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/** A tactile premium card face (§3.4). DOM/SVG render; PixiJS upgrade is later polish. */
export function CardFace({ card, selected, playable, small, onClick }: Props) {
  const faceDown = card === "?";
  const suit = card[card.length - 1] ?? "";
  const rank = card.slice(0, card.length - 1);
  const red = suit === "H" || suit === "D";
  const label = RANK_LABEL[rank] ?? rank;
  const glyph = SUIT_GLYPH[suit] ?? "";
  const size = small ? "h-16 w-11 text-sm" : "h-24 w-16 text-lg";

  if (faceDown) {
    return (
      <div
        aria-hidden
        className={cn(
          "rounded-card border border-brass-400/30 bg-gradient-to-br from-felt-700 to-felt-900 shadow-card",
          size,
        )}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(217,178,95,.12) 0 6px, transparent 6px 12px)",
        }}
      />
    );
  }

  const face = (
    <>
      <span className="text-left font-semibold leading-none">
        {label}
        <span className="block">{glyph}</span>
      </span>
      <span className="self-end text-2xl leading-none">{glyph}</span>
    </>
  );

  const base = cn(
    "relative flex flex-col justify-between rounded-card border bg-ink-100 p-1.5 shadow-card transition-transform duration-fast ease-snap",
    size,
    red ? "text-suit-red" : "text-suit-black",
    selected && "-translate-y-3 ring-2 ring-brass-300",
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}${glyph}`}
        className={cn(
          base,
          playable ? "cursor-pointer hover:-translate-y-2" : "cursor-not-allowed opacity-80",
        )}
      >
        {face}
      </button>
    );
  }

  return (
    <div aria-label={`${label}${glyph}`} className={base}>
      {face}
    </div>
  );
}
