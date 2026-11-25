import Link from 'next/link';
import { cn } from '@/components/ui/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'focus-ring inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-e1 hover:bg-accent-hover active:bg-accent-active',
  secondary:
    'border border-line-strong bg-surface text-fg shadow-e1 hover:border-line-input hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-fg-2 hover:bg-surface-3 hover:text-fg active:bg-surface-3',
  danger:
    'bg-danger text-white shadow-e1 hover:brightness-95 active:brightness-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-6 text-[1rem]',
};

/** Класовете на бутона — за <button>, <a>, <Link> и <summary>. */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export function Button({
  variant,
  size,
  block,
  className,
  type = 'button',
  ...props
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, block, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: Common & React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={buttonStyles({ variant, size, block, className })}
      {...props}
    />
  );
}
