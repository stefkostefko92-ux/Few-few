import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-300">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "rounded-card border bg-felt-900/60 px-4 py-2.5 text-ink-100 placeholder:text-ink-muted",
          "transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-brass-300",
          error ? "border-loss" : "border-brass-400/20",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-sm text-loss">
          {error}
        </p>
      ) : null}
    </div>
  );
});
