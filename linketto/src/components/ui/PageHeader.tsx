import { cn } from '@/components/ui/cn';

// Заглавие на екран в приложението (табло/админ): h1, кратко описание,
// действия отдясно.
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-heading text-fg">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-body text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
