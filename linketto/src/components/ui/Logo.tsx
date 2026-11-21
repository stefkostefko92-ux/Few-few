import { cn } from '@/components/ui/cn';

// Монограмата: две свързани дъги (звено на верига) в заоблен квадрат —
// линк + свързаност. Само SVG: остър на всяка плътност, сменя цвета със
// темата, тежи под 1 KB (старото растерно лого беше 420 KB).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('h-7 w-7 shrink-0', className)}
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M13.2 18.8a4.2 4.2 0 0 0 5.9 0l3-3a4.2 4.2 0 0 0-5.9-5.9l-1 1"
        fill="none"
        stroke="rgb(var(--c-accent-fg))"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M18.8 13.2a4.2 4.2 0 0 0-5.9 0l-3 3a4.2 4.2 0 0 0 5.9 5.9l1-1"
        fill="none"
        stroke="rgb(var(--c-accent-fg))"
        strokeOpacity="0.62"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[1.0625rem] font-extrabold tracking-[-0.03em] text-fg">
        {name}
      </span>
    </span>
  );
}
