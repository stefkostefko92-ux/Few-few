import 'server-only';
// The choices of an uploaded file's form, with their Italian labels, made on the server: the kinds (messages
// allegati.kinds) and the parts of the relazione tecnica di modifica — its sections by their titles in the document
// (src/lib/rt/sezioni.ts, one place), the installation as a whole, the building. The workspace's expected documents
// (S7) preset an upload with the same values.
import { getTranslations } from 'next-intl/server';
import { ALLEGATO_KINDS, COMPONENTI, type AllegatoKind, type Componente } from '@/lib/allegati/kinds';
import { isSezioneKey } from '@/lib/rt/types';
import { titoloSezione } from '@/lib/rt/sezioni';

export interface Option<V extends string = string> { value: V; label: string }
export interface AllegatiOptions { kinds: Option<AllegatoKind>[]; components: Option<Componente>[] }

export async function allegatiOptions(): Promise<AllegatiOptions> {
  const t = await getTranslations('allegati');
  return {
    kinds: ALLEGATO_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })),
    components: COMPONENTI.map((c) => ({
      value: c,
      label: isSezioneKey(c) ? titoloSezione(c) : c === 'impianto' ? t('componentImpianto') : t('componentEdificio'),
    })),
  };
}

/** The label of a value among the options, «—» when there is none. */
export const labelOf = <V extends string>(options: readonly Option<V>[], value: V | null | undefined): string =>
  options.find((o) => o.value === value)?.label ?? '—';
