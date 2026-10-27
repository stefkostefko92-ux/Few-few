// The «Allegati» page of the RT after the owner's model (its last page): the general note, the documents declared
// attached (only those «si», in the model's order: E-AL-2), the files uploaded and appended after the body, the note on
// the data, the conformity of the copies, the signatures — «Elaborata da» and the engineer who verifies (owner's decision
// 3, in place of the model's «Direttore Tecnico»), each with a box for the hand. The model's texts. Pure.
import { ALLEGATO_TESTO } from '../../rt2/allegati';
import type { Rt2Derivato } from '../../rt2/derive';
import type { Rt2Inputs } from '../../rt2/input';
import type { PaginaCtx } from '../../rt2/types';
import { DOC, fill, giorno } from '../rt/testi';
import type { FBlock } from './model';

export interface FileAllegato { position: number; title: string }

export function paginaAllegati(d: Rt2Derivato, x: Rt2Inputs, files: readonly FileAllegato[], azienda: string, p: PaginaCtx): FBlock[] {
  const F = DOC.firme, red = x.firme?.redatto, ver = x.firme?.verificato, da = DOC.daIndicare;
  const ordine = fill(F.ordine, { provincia: ver?.provincia ?? da, numero: ver?.numero ?? da });
  const app = d.ctx.norma === '10411-1' ? 'nell\'appendice C' : 'nell\'appendice A';
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo }, { t: 'testo', s: 'Allegato alla Relazione di Calcolo', b: true, c: true }, { t: 'spazio', mm: 3 },
    { t: 'testo', s: 'Nota Generale', b: true },
    { t: 'testo', s: `A seguito di qualsiasi modifica sull'impianto, le nuove caratteristiche dell'impianto stesso devono risultare dalla documentazione allegata ${app}, che deve essere messa a disposizione del proprietario per la verifica straordinaria prevista dalla legislazione vigente.` },
    { t: 'testo', s: 'Nel caso di componenti di sicurezza realizzati da produttori che applicano il sistema di garanzia qualità totale previsto dalla legislazione vigente, l\'attestato di esame CE/UE del Tipo può essere sostituito da un altro documento riportante le caratteristiche tecniche e il campo di applicazione del componente di sicurezza.' },
    { t: 'spazio', mm: 2 },
    { t: 'testo', s: `Nel presente allegato sono contenuti i seguenti documenti relativi ai componenti interessati dalla modifica, come indicato ${app} (documentazione tecnica) della norma ${p.norma}` },
    { t: 'testo', s: 'Documenti allegati alla seguente relazione :', b: true },
    ...d.allegati.map((a): FBlock => ({ t: 'testo', s: `–  ${ALLEGATO_TESTO[a].stampa}` })),
    ...(files.length ? [{ t: 'testo' as const, s: 'File allegati in coda al fascicolo:', b: true },
      ...files.map((f): FBlock => ({ t: 'testo', s: `Allegato ${f.position} – ${f.title}` }))] : []),
    { t: 'spazio', mm: 2 },
    { t: 'testo', s: 'Nota', b: true },
    { t: 'testo', s: 'I dati relativi all\'impianto sono quelli dichiarati sul libretto, mentre per quanto concerne i dati mancanti necessari per le verifiche tecniche, (es. peso cabina, contrappeso, ecc..) questi sono stati dichiarati direttamente dall\'installatore e/o esecutore dei lavori, comprese le modifiche apportate all\'impianto.' },
    { t: 'testo', s: 'Tutte le verifiche sono state eseguite attenendosi ad esse.' },
    { t: 'testo', s: 'Si declina ogni responsabilità per dati e/o informazioni non veritiere e riguardanti l\' impianto all\'atto del collaudo e/o visita straordinaria da parte dell\'ente notificato.' },
    { t: 'testo', s: 'Si dichiara che le documentazioni contenute in questo fascicolo sono copie conformi all\'originale.' },
    { t: 'firme', cols: [
      { title: 'Elaborata da:', lines: [red?.nome ?? da, ...(red?.qualifica ? [red.qualifica] : []), azienda, `data ${giorno(x.doc?.data)}`], box: { label: F.firma, w: 70, h: 28 } },
      { title: 'Verificata da:', lines: [ver?.titolo && ver.nome ? `${ver.titolo} ${ver.nome}` : da, ordine, ...(ver?.sezione ? [fill(F.sezione, { s: ver.sezione })] : [])],
        box: { label: F.timbro, w: 45, h: 45 } },
    ] },
  ];
}
