export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-muted">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label ? <span className="text-base">{label}</span> : null}
    </div>
  );
}
