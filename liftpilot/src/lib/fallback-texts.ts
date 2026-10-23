// The words of the global error page (src/app/global-error.tsx): it replaces even the root layout, so no messages are
// loaded there and the whole of messages/it.json would be too heavy for that one page in the browser. They are the very
// words of messages/it.json (errors.*), and a test keeps them so (src/lib/__tests__/fallback-texts.test.ts).
export const GLOBAL_ERROR_TEXTS = {
  title: 'Si è verificato un errore',
  text: 'L’operazione non è andata a buon fine. Riprova; se il problema continua, comunica il codice qui sotto.',
  /** errors.errorCode without its placeholder */
  code: 'Codice: ',
  retry: 'Riprova',
  home: 'Pagina iniziale',
  /** errors.reportMail before and after the address */
  mail: ['Se il problema continua puoi anche scrivere a ', ', indicando il codice e che cosa stavi facendo.'],
} as const;
