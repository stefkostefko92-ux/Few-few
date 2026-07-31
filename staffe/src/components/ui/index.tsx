import type { ComponentProps, ReactNode } from 'react';
import type { Tone } from '@/lib/labels';

/**
 * Primitive dell'interfaccia (equivalenti shadcn/ui, scritte a mano su Tailwind).
 *
 * Perché non la libreria: il magazzino gira anche su tablet vecchi e su rete
 * interna. Queste primitive sono ~200 righe senza dipendenze runtime, usano gli
 * elementi nativi (`button`, `input`, `select`, `dialog`) e quindi ereditano
 * gratis accessibilità e comportamento da tastiera — che è ciò per cui shadcn/ui
 * userebbe Radix.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─────────────────────────── Bottone ───────────────────────────

type ButtonVariant = 'primario' | 'secondario' | 'fantasma' | 'pericolo';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primario: 'bg-brand text-brand-fg hover:opacity-90',
  secondario: 'bg-surface text-fg border border-border hover:bg-muted',
  fantasma: 'text-fg hover:bg-muted',
  pericolo: 'bg-danger text-white hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // `lg` è la taglia da guanti: bersaglio ≥ 44px, come chiede WCAG 2.2.
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primario',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

// ─────────────────────────── Campi ───────────────────────────

const FIELD =
  'w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted disabled:opacity-60';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(FIELD, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(FIELD, 'min-h-24', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <select className={cx(FIELD, 'h-10', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-label="obbligatorio">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-fg-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Contenitori ───────────────────────────

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('rounded border border-border bg-surface p-4', className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ─────────────────────────── Badge e indicatori ───────────────────────────

const TONE_CLASSES: Record<Tone, string> = {
  neutro: 'bg-muted text-fg-muted',
  corso: 'bg-brand/15 text-brand',
  ok: 'bg-ok/15 text-ok',
  avviso: 'bg-warn/15 text-warn',
  errore: 'bg-danger/15 text-danger',
};

export function Badge({
  tone = 'neutro',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Semaforo di giacenza: rosso esaurito, giallo sotto scorta, verde regolare. */
export function StockIndicator({
  qty,
  minStock,
  suffix,
}: {
  qty: number;
  minStock: number;
  suffix?: string;
}) {
  const tone: Tone = qty <= 0 ? 'errore' : qty <= minStock ? 'avviso' : 'ok';
  const stato = qty <= 0 ? 'esaurito' : qty <= minStock ? 'sotto scorta' : 'disponibile';
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cx(
          'h-2 w-2 rounded-full',
          tone === 'errore' ? 'bg-danger' : tone === 'avviso' ? 'bg-warn' : 'bg-ok',
        )}
      />
      <span className="tabular-nums">
        {qty}
        {suffix ? ` ${suffix}` : ''}
      </span>
      {/* Il colore da solo non basta (WCAG 1.4.1): lo stato è anche testo. */}
      <span className="sr-only">{stato}</span>
    </span>
  );
}

// ─────────────────────────── Tabella ───────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cx('border-b border-border px-3 py-2 align-middle', className)}>
      {children}
    </td>
  );
}
