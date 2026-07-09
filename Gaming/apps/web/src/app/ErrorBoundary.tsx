import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

class Boundary extends Component<BoundaryProps, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    console.error("Unhandled render error:", error);
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Catches render crashes in routed content so a bug in one game view degrades
 * to a friendly message instead of white-screening the whole app. "Back to
 * lobby" is a full navigation, which also resets the failed component tree.
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Boundary
      fallback={
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="font-display text-2xl text-ink-100">{t("error.title")}</h1>
          <p className="mt-3 text-ink-muted">{t("error.body")}</p>
          <a
            href={import.meta.env.BASE_URL}
            className="mt-6 inline-block rounded-card bg-brass-300 px-5 py-2 font-medium text-charcoal-900"
          >
            {t("error.backToLobby")}
          </a>
        </div>
      }
    >
      {children}
    </Boundary>
  );
}
