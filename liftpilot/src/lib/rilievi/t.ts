// The translator of the survey sheets: a key of the `rilievi` namespace of messages/it.json (`scheda.field.data`,
// `common.yes`…) with its values. The pure modules take it as an argument; the server makes it with i18n.ts, a page with
// next-intl (`getTranslations('rilievi')` / `useTranslations('rilievi')`), both over the same messages.
export type RilieviT = (key: string, values?: Record<string, string | number>) => string;
