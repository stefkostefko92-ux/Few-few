import { cn } from '@/components/ui/cn';

// Таблицата е с хоризонтален скрол в обвивка (не чупи мобилния изглед);
// заглавията са <th scope>. Всичко наследява токените.

export function Table({
  className,
  wrapperClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-surface', wrapperClassName)}>
      <table
        className={cn('w-full border-collapse text-start text-small', className)}
        {...props}
      />
    </div>
  );
}

export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className="bg-surface-2" {...p} />
);
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="divide-y divide-line" {...p} />
);
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('transition-colors hover:bg-surface-2/60', className)} {...p} />
);
export const TH = ({
  className,
  scope = 'col',
  ...p
}: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope={scope}
    className={cn('px-4 py-3 text-start text-small font-semibold text-fg-2', className)}
    {...p}
  />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 align-top text-fg-2', className)} {...p} />
);
