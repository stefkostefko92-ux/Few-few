import { cn } from '@/components/ui/cn';

export type CardVariant = 'default' | 'raised' | 'muted' | 'accent';

const VARIANTS: Record<CardVariant, string> = {
  default: 'border border-line bg-surface shadow-e1',
  raised: 'border border-line bg-surface shadow-e2',
  muted: 'border border-line bg-surface-2',
  accent: 'border border-accent/40 bg-surface shadow-e2',
};

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' };

export function Card({
  variant = 'default',
  padding = 'md',
  as: Tag = 'div',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  variant?: CardVariant;
  padding?: keyof typeof PADDING;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag
      className={cn('rounded-card', VARIANTS[variant], PADDING[padding], className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-subheading text-fg">{title}</h3>
        {description && (
          <p className="mt-1 text-small text-fg-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
