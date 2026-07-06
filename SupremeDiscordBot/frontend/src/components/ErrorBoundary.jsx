// frontend/src/components/ErrorBoundary.jsx
// App-wide error boundary — prevents an uncaught render error from
// white-screening the whole SPA. Forwards the error to Sentry if configured.
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
    if (typeof window !== "undefined" && window.__SENTRY__ && window.Sentry?.captureException) {
      window.Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="min-h-screen bg-cs-bg flex items-center justify-center px-6 text-center"
      >
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-black text-cs-text mb-3">
            Something went wrong
          </h1>
          <p className="text-cs-muted mb-8">
            An unexpected error occurred. Reloading the page usually fixes it. If
            the problem persists, contact our support team.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => window.location.reload()} className="cs-btn-primary">
              Reload page
            </button>
            <a href="/" className="cs-btn-secondary">Back to home</a>
          </div>
          <p className="text-cs-dim text-xs mt-6 font-mono">
            support: discord@carbonstealth.eu
          </p>
        </div>
      </div>
    );
  }
}
