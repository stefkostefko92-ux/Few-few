import { lavoriDi, type ValoriScheda } from '../cartelli/da-scheda.js';
import type { FormValues } from '../schede/field-parsers.js';
import { businessDay } from '../time.js';
import { formValuesDaPreventivo, type PreventivoData } from './form.js';

/**
 * Новата оферта от картата (C1): уредбата (матрикула, номер, адрес), предметът и по ред за всяка работа,
 * която картата казва (само видимите полета със „Sì“ — както листа и табелата), с количество 1. Цена не
 * се измисля: редът чака цената от човека (или от ценоразписа). Клиентът на картата го няма — пише се.
 */
export function valoriDaScheda(
  scheda: ValoriScheda & {
    indirizzo: string | null;
    matricola: string | null;
    numeroImpianto: string | null;
  },
  condizioni: string | null,
): FormValues {
  const { sostituzione, installazione } = lavoriDi(scheda);
  const lavori = [
    ...sostituzione.map((cosa) => `Sostituzione ${cosa}`),
    ...installazione.map((cosa) => `Installazione ${cosa}`),
  ];
  const impianto = [
    scheda.matricola ? `Matricola ${scheda.matricola}` : '',
    scheda.numeroImpianto ? `N° ${scheda.numeroImpianto}` : '',
    scheda.indirizzo ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  const out: FormValues = {
    data: businessDay(),
    validitaGiorni: '30',
    impianto: impianto.slice(0, 300),
    oggetto: (lavori.length === 1
      ? lavori[0]!
      : lavori.length > 1
        ? 'Lavori sull’impianto'
        : ''
    ).slice(0, 300),
    condizioni: condizioni ?? '',
  };
  lavori.forEach((descrizione, i) => {
    out[`r-${i}-descrizione`] = descrizione;
    out[`r-${i}-quantita`] = '1';
    out[`r-${i}-unita`] = 'a corpo';
    out[`r-${i}-iva`] = '22';
  });
  return out;
}

/** „Duplica“: всичко от офертата освен деня (днес) — номерът и състоянието са на новата. */
export function valoriDaCopia(d: PreventivoData): FormValues {
  return { ...formValuesDaPreventivo(d), data: businessDay() };
}
