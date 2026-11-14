// frontend/src/components/ErrorBoundary.jsx
// App-wide error boundary — prevents an uncaught render error from
// white-screening the whole SPA. Forwards the error to Sentry if configured.
import { Component } from "react";

// Границата е НАД всички доставчици (и над превода) — когато тя се покаже,
// контекстът може да е счупен. Затова езикът идва от <html lang>, който
// сайтът и таблото поддържат, а текстовете са тук.
const TEXT = {
  en: { heading: "Something went wrong", body: "An unexpected error occurred. Reloading the page usually fixes it. If the problem persists, contact our support team.", reload: "Reload page", home: "Back to home", support: "Support" },
  bg: { heading: "Нещо се обърка", body: "Възникна неочаквана грешка. Обикновено презареждането на страницата я оправя. Ако проблемът остане, пишете на поддръжката.", reload: "Презареди страницата", home: "Към началото", support: "Поддръжка" },
  de: { heading: "Etwas ist schiefgelaufen", body: "Ein unerwarteter Fehler ist aufgetreten. Meist hilft es, die Seite neu zu laden. Besteht das Problem weiter, wenden Sie sich an unseren Support.", reload: "Seite neu laden", home: "Zur Startseite", support: "Support" },
  es: { heading: "Algo ha ido mal", body: "Se ha producido un error inesperado. Normalmente se soluciona al recargar la página. Si el problema continúa, contacta con el soporte.", reload: "Recargar la página", home: "Volver al inicio", support: "Soporte" },
  fr: { heading: "Une erreur s’est produite", body: "Une erreur inattendue est survenue. Recharger la page suffit généralement. Si le problème persiste, contactez notre support.", reload: "Recharger la page", home: "Retour à l’accueil", support: "Support" },
  it: { heading: "Qualcosa è andato storto", body: "Si è verificato un errore imprevisto. Di solito basta ricaricare la pagina. Se il problema persiste, contatta il supporto.", reload: "Ricarica la pagina", home: "Torna alla home", support: "Supporto" },
  nl: { heading: "Er is iets misgegaan", body: "Er is een onverwachte fout opgetreden. Meestal helpt het om de pagina te herladen. Blijft het probleem, neem dan contact op met de support.", reload: "Pagina herladen", home: "Terug naar home", support: "Support" },
  pl: { heading: "Coś poszło nie tak", body: "Wystąpił nieoczekiwany błąd. Zwykle pomaga ponowne załadowanie strony. Jeśli problem nie ustąpi, skontaktuj się z pomocą techniczną.", reload: "Załaduj ponownie", home: "Wróć na stronę główną", support: "Pomoc" },
};
const pickText = () => TEXT[(typeof document !== "undefined" && document.documentElement.lang) || "en"] || TEXT.en;

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
    const L = pickText();
    return (
      <div
        role="alert"
        data-error-boundary=""
        className="min-h-screen bg-cs-bg flex items-center justify-center px-6 text-center"
      >
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-black text-cs-text mb-3">
            {L.heading}
          </h1>
          <p className="text-cs-muted mb-8">
            {L.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => window.location.reload()} className="cs-btn-primary">
              {L.reload}
            </button>
            <a href="/" className="cs-btn-secondary">{L.home}</a>
          </div>
          <p className="text-cs-dim text-xs mt-6">
            {L.support}: discord@carbonstealth.eu
          </p>
        </div>
      </div>
    );
  }
}
