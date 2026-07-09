import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "brass" | "ghost" | "felt";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Primary brass — premium, tactile (light overshoot on press via ease-snap).
  brass:
    "bg-gradient-to-b from-brass-300 to-brass-400 text-charcoal-900 shadow-card hover:from-brass-100 hover:to-brass-300 active:translate-y-px",
  ghost: "bg-transparent text-ink-300 hover:text-ink-100 hover:bg-felt-700/40",
  felt: "bg-felt-700 text-ink-100 shadow-card hover:bg-felt-800 border border-brass-400/20",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "brass", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-card px-5 py-2.5 font-semibold",
        "transition-all duration-fast ease-snap focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-brass-300 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
});
