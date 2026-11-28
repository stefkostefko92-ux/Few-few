import { cn } from '@/components/ui/cn';

// Единна ширина и странични полета за всички секции.
export function Container({
  className,
  narrow = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { narrow?: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-8',
        narrow ? 'max-w-3xl' : 'max-w-page',
        className,
      )}
      {...props}
    />
  );
}
