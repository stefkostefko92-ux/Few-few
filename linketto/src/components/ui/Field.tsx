import { cn } from '@/components/ui/cn';

// Полета на формите. Рамката е ≥3:1 спрямо повърхността (WCAG 1.4.11), в
// двете теми; невалидното (:user-invalid) се оцветява след първо взаимодействие.

export const controlStyles =
  'w-full rounded-control border border-line-input bg-surface px-3 text-body text-fg shadow-e1 transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus [&:user-invalid]:border-danger [&:user-invalid]:shadow-[0_0_0_3px_rgb(var(--c-danger)/0.2)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60';

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-small font-semibold text-fg', className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlStyles, 'h-10', className)} {...props} />;
}

const CHEVRON =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238a96a8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:1rem] bg-[position:right_0.65rem_center] bg-no-repeat rtl:bg-[position:left_0.65rem_center]";

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        controlStyles,
        CHEVRON,
        'h-10 cursor-pointer appearance-none pe-9',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlStyles, 'min-h-24 resize-y py-2.5', className)}
      {...props}
    />
  );
}

export function FieldHint({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-small text-fg-muted', className)} {...props} />
  );
}

export function FieldError({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      className={cn('text-small font-medium text-danger-text', className)}
      {...props}
    />
  );
}

/** Етикет + контрола + подсказка/грешка с правилните aria-връзки. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Контролата получава id-то и aria-describedby от извикващия */
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <FieldHint id={`${id}-hint`}>{hint}</FieldHint>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
