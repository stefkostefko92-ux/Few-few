import { DAY } from '../time.js';
import type { SessionUser } from '../types.js';

/**
 * Лентите за абонамента над страниците (views/partials/comunicazioni.ejs) — без база: от членствата в сесията.
 * Изтекъл — „само четене“ (без „Chiudi“, докато трае); пробният месец или платеният период свършва до 14 дни —
 * напомняне. Администраторът получава и връзката към „Impostazioni → Abbonamento“.
 */
/** Чл. 12.6: известие 14 дни преди края. */
export const GIORNI_PREAVVISO = 14;

export interface AvvisoAbbonamento {
  aziendaId: string;
  azienda: string;
  tipo: 'scaduto' | 'prova' | 'scade';
  /** Последният ден на периода (краят е полунощ — денят преди нея). */
  ultimoGiorno: Date;
  admin: boolean;
}

export function avvisiAbbonamento(user: SessionUser, now: Date = new Date()): AvvisoAbbonamento[] {
  const avvisi: AvvisoAbbonamento[] = [];
  for (const m of user.memberships) {
    if (m.soloEsportazione || !m.abbonamentoFino) continue;
    const resta = m.abbonamentoFino.getTime() - now.getTime();
    const tipo = m.solaLettura
      ? 'scaduto'
      : resta <= GIORNI_PREAVVISO * DAY
        ? m.abbonamentoProva
          ? 'prova'
          : 'scade'
        : null;
    if (!tipo) continue;
    avvisi.push({
      aziendaId: m.aziendaId,
      azienda: m.aziendaName,
      tipo,
      ultimoGiorno: new Date(m.abbonamentoFino.getTime() - 1),
      admin: m.role === 'ADMIN',
    });
  }
  // Изтеклите първи.
  return avvisi.sort((a, b) => Number(b.tipo === 'scaduto') - Number(a.tipo === 'scaduto'));
}
