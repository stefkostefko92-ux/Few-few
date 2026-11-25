import { cn } from '@/components/ui/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-surface-3 text-fg-2', dot: 'bg-fg-muted' },
  accent: { box: 'bg-accent-soft text-accent-soft-fg', dot: 'bg-accent-text' },
  success: { box: 'bg-success-soft text-success-text', dot: 'bg-success' },
  warning: { box: 'bg-warning-soft text-warning-text', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft text-danger-text', dot: 'bg-danger' },
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-semibold',
        TONES[tone].box,
        className,
      )}
      {...props}
    >
      {dot && (
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', TONES[tone].dot)} />
      )}
      {children}
    </span>
  );
}
