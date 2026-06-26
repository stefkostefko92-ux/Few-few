import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "brass" | "felt" | "vip";

const tones: Record<Tone, string> = {
  brass: "bg-brass-400/15 text-brass-300 border-brass-400/30",
  felt: "bg-felt-700 text-ink-300 border-brass-400/10",
  vip: "bg-vip/15 text-vip border-vip/40",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "felt", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
