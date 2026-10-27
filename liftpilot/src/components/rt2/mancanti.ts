// What is missing to issue an RT after the owner's model, in words, with the step it is in. Pure.
import type { MancanteRt2 } from '@/lib/rt2/derive';
import { moduloDi } from '@/lib/rt2/componenti';
import { TITOLI_RT2 } from '@/lib/rt2/titoli';
import { isComponenteRt2 } from '@/lib/rt2/types';

const CAMPI: Readonly<Record<string, string>> = {
  'doc.costruttore': 'Dati generali: Ascensore di costruzione', 'doc.utentiEsperti': 'Dati generali: Utenti autorizzati ed esperti',
  'doc.ascensorista': 'Dati generali: Ascensorista', 'doc.componentiModificati': 'Dati generali: Componenti modificati o tipologia modifica (almeno 20 caratteri)',
  'firme.redatto.nome': 'Firme: Redatto da', 'firme.verificato.titolo': 'Firme: titolo dell’ingegnere', 'firme.verificato.nome': 'Firme: nome dell’ingegnere',
  'firme.verificato.provincia': 'Firme: provincia dell’Ordine', 'firme.verificato.numero': 'Firme: numero di iscrizione',
  'anagrafica.proprietario.nome': 'Dati dell’impianto: proprietario', 'anagrafica.legge': 'Dati dell’impianto: norma di collaudo («Collaudato secondo») scelta o confermata',
  'calcolo.carichi': 'Calcolo argano: portata, massa della cabina e bilanciamento', 'calcolo.velocita': 'Calcolo argano: velocità nominale',
  'calcolo.corsa': 'Calcolo argano: corsa', 'tecnici.dopo.superficie': 'Dati tecnici: superficie della cabina (dopo o documentata prima)',
  'tecnici.dopo.capienza': 'Dati tecnici: capienza (dopo o documentata prima)', 'calcolo.funi': 'Calcolo argano: funi, puleggia e gola', 'calcolo.macchina': 'Calcolo argano: dati della macchina',
};

export function mancanteTesto(m: MancanteRt2): string {
  if (CAMPI[m.campo]) return CAMPI[m.campo] ?? m.campo;
  if (isComponenteRt2(m.dove)) {
    const label = moduloDi(m.dove)?.campi.find((c) => c.id === m.campo)?.label;
    return `${TITOLI_RT2[m.dove]}: ${label ?? CAMPI[m.campo] ?? m.campo}`;
  }
  return m.campo;
}
