// The translator of the survey sheets outside a page (the PDFs, the tests): the `rilievi` namespace of messages/it.json
// through next-intl's own formatter — its core, use-intl/core: no React, so it runs alike in a route handler and in the
// tests under the react-server condition —, so the PDF says exactly what the pages say. Imports all the messages: server
// and tests only (a component takes `getTranslations('rilievi')` / `useTranslations('rilievi')`).
import { createTranslator } from 'use-intl/core';
import messages from '../../../messages/it.json';
import type { RilieviT } from './t';

let cached: RilieviT | null = null;

export function rilieviTranslator(): RilieviT {
  if (cached) return cached;
  const t = createTranslator({ locale: 'it', messages, namespace: 'rilievi', timeZone: 'Europe/Rome' });
  // the keys are built from the field list (scheda.field.<key>): the translator takes any string of the namespace
  const loose = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  cached = (key, values) => loose(key, values);
  return cached;
}
