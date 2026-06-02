import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

/** Felt panel with a brass hairline border — the core surface (§3.1). */
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Panel(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-panel border border-brass-400/15 bg-felt-800/80 p-6 shadow-lift backdrop-blur-sm",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
