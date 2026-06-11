import { cn } from "../../../ui";

const PIP_MAP: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Half({ value }: { value: number }) {
  const on = new Set(PIP_MAP[value] ?? []);
  return (
    <span className="dom-half">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={cn("dom-pip", !on.has(i) && "dom-pip--off")} />
      ))}
    </span>
  );
}

/** A domino tile "a-b". Vertical orientation for hand display. */
export function DominoTile({
  tile,
  vertical,
  playable,
  onClick,
}: {
  tile: string;
  vertical?: boolean;
  playable?: boolean;
  onClick?: () => void;
}) {
  if (tile === "?") return <span className="dom-tile dom-tile--back" aria-hidden />;
  const [a, b] = tile.split("-").map(Number) as [number, number];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={`домино ${a}-${b}`}
      className={cn("dom-tile", vertical && "dom-tile--v", playable && "dom-tile--playable")}
      style={{ transition: "transform 140ms cubic-bezier(.2,.9,.25,1.15)" }}
    >
      <Half value={a} />
      <Half value={b} />
    </Tag>
  );
}
