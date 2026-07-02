import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Panel } from "../../ui";
import { ApiError } from "../../lib/api";

/**
 * Admin loader hook: every panel loader surfaces its error (with retry)
 * instead of swallowing it into an eternal "Loading…" (P0 finding). `deps`
 * re-runs the load; `reload` re-runs it manually.
 */
export function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: unknown; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Human-readable message out of an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Error state for admin loaders: message + retry; session-expiry gets a login link. */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const expired = error instanceof ApiError && error.status === 401;
  return (
    <Panel className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm font-medium text-loss">
        {expired
          ? t("admin.sessionExpired", "Сесията е изтекла — влез отново.")
          : t("admin.loadError", "Грешка при зареждане.")}
      </p>
      {!expired ? <p className="text-xs text-ink-muted">{errorMessage(error)}</p> : null}
      {expired ? (
        <Link to="/login" className="text-sm text-brass-300 underline">
          {t("admin.goLogin", "Към входа")}
        </Link>
      ) : (
        <Button variant="felt" onClick={onRetry}>
          {t("admin.retry", "Опитай пак")}
        </Button>
      )}
    </Panel>
  );
}
