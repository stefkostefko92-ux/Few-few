import { useTranslation } from "react-i18next";
import { cn } from "../../../ui";
import "./chips.css";

/** A small stack of casino chips representing an amount (visual only). */
export function ChipStack({ amount, size = "md" }: { amount: number; size?: "sm" | "md" }) {
  // Map an amount to a few stacked chip discs (visual flourish, not exact).
  const count = amount <= 0 ? 0 : Math.min(6, 1 + Math.floor(Math.log2(amount / 10 + 1)));
  const tones = ["chip--brass", "chip--red", "chip--felt", "chip--brass", "chip--red", "chip--felt"];
  return (
    <span className={cn("chipstack", size === "sm" && "chipstack--sm")} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={cn("chip", tones[i % tones.length])} style={{ bottom: i * 4 }} />
      ))}
    </span>
  );
}

/** Pot display: chip pile + the amount in tabular figures. */
export function Pot({ amount, label }: { amount: number; label: string }) {
  const { i18n } = useTranslation();
  return (
    <div className="pot">
      <ChipStack amount={amount} />
      <span className="pot__amount tnum">
        {label}: {amount.toLocaleString(i18n.language)}
      </span>
    </div>
  );
}
