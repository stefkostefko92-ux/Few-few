import { PrismaClient } from '@prisma/client';
import { createAuditLog } from './audit';

const prisma = new PrismaClient();

interface ScadenzaAlert {
  tipo: 'revisione' | 'assicurazione' | 'tagliando' | 'certificazione' | 'contratto' | 'visita' | 'verifica';
  entita: string;
  entitaId: string;
  descrizione: string;
  dataScadenza: Date;
  giorniRimanenti: number;
  livello: 'scaduto' | 'critico' | 'attenzione' | 'informativo';
}

export async function controllaScadenze(): Promise<ScadenzaAlert[]> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const in60 = new Date(now.getTime() + 60 * 86400000);
  const in90 = new Date(now.getTime() + 90 * 86400000);
  const alerts: ScadenzaAlert[] = [];

  // ── Impianti: revisioni ──
  const impianti = await prisma.impianto.findMany({
    where: {
      stato: { in: ['ATTIVO', 'MANUTENZIONE'] },
      prossimaRevisione: { lte: in90 },
    },
    select: { id: true, matricola: true, marca: true, modello: true, prossimaRevisione: true },
  });

  for (const imp of impianti) {
    if (!imp.prossimaRevisione) continue;
    const gg = Math.ceil((imp.prossimaRevisione.getTime() - now.getTime()) / 86400000);
    alerts.push({
      tipo: 'revisione',
      entita: 'impianti',
      entitaId: imp.id,
      descrizione: `Revisione ${imp.matricola} (${imp.marca} ${imp.modello})`,
      dataScadenza: imp.prossimaRevisione,
      giorniRimanenti: gg,
      livello: gg < 0 ? 'scaduto' : gg <= 30 ? 'critico' : gg <= 60 ? 'attenzione' : 'informativo',
    });
  }

  // ── Scadenze impianto personalizzate ──
  const scadenzeCustom = await prisma.scadenzaImpianto.findMany({
    where: {
      completata: false,
      dataScadenza: { lte: in90 },
    },
    include: { impianto: { select: { id: true, matricola: true } } },
  });

  for (const sc of scadenzeCustom) {
    const gg = Math.ceil((sc.dataScadenza.getTime() - now.getTime()) / 86400000);
    alerts.push({
      tipo: 'certificazione',
      entita: 'scadenze_impianti',
      entitaId: sc.id,
      descrizione: `${sc.tipo}: ${sc.impianto.matricola}`,
      dataScadenza: sc.dataScadenza,
      giorniRimanenti: gg,
      livello: gg < 0 ? 'scaduto' : gg <= 30 ? 'critico' : gg <= 60 ? 'attenzione' : 'informativo',
    });

    // Update notification flags
    const updates: any = {};
    if (gg <= 90 && !sc.notificato90) updates.notificato90 = true;
    if (gg <= 60 && !sc.notificato60) updates.notificato60 = true;
    if (gg <= 30 && !sc.notificato30) updates.notificato30 = true;
    if (Object.keys(updates).length > 0) {
      await prisma.scadenzaImpianto.update({ where: { id: sc.id }, data: updates });
    }
  }

  // ── Automezzi: revisione, assicurazione, tagliando ──
  const automezzi = await prisma.automezzo.findMany({
    where: {
      OR: [
        { scadenzaRevisione: { lte: in90 } },
        { scadenzaAssicurazione: { lte: in90 } },
        { scadenzaTagliando: { lte: in90 } },
      ],
    },
    select: {
      id: true, targa: true, marca: true, modello: true,
      scadenzaRevisione: true, scadenzaAssicurazione: true, scadenzaTagliando: true,
    },
  });

  for (const auto of automezzi) {
    const scadenze = [
      { tipo: 'revisione' as const, data: auto.scadenzaRevisione },
      { tipo: 'assicurazione' as const, data: auto.scadenzaAssicurazione },
      { tipo: 'tagliando' as const, data: auto.scadenzaTagliando },
    ];

    for (const sc of scadenze) {
      if (!sc.data || sc.data > in90) continue;
      const gg = Math.ceil((sc.data.getTime() - now.getTime()) / 86400000);
      alerts.push({
        tipo: sc.tipo,
        entita: 'automezzi',
        entitaId: auto.id,
        descrizione: `${sc.tipo.charAt(0).toUpperCase() + sc.tipo.slice(1)} ${auto.targa} (${auto.marca} ${auto.modello})`,
        dataScadenza: sc.data,
        giorniRimanenti: gg,
        livello: gg < 0 ? 'scaduto' : gg <= 30 ? 'critico' : gg <= 60 ? 'attenzione' : 'informativo',
      });
    }

    // Update semaforo
    const minGg = scadenze
      .filter(s => s.data)
      .map(s => Math.ceil((s.data!.getTime() - now.getTime()) / 86400000));
    const minimo = minGg.length > 0 ? Math.min(...minGg) : 999;
    const nuovoStato = minimo < 0 ? 'rosso' : minimo <= 30 ? 'giallo' : 'verde';

    if (nuovoStato !== 'verde') {
      await prisma.automezzo.update({
        where: { id: auto.id },
        data: { stato: nuovoStato },
      });
    }
  }

  // ── Contratti in scadenza ──
  const contratti = await prisma.contratto.findMany({
    where: { stato: 'ATTIVO', dataFine: { not: null, lte: in90 } },
    include: { impianto: { select: { matricola: true } } },
  });
  for (const c of contratti) {
    const gg = Math.ceil((c.dataFine!.getTime() - now.getTime()) / 86400000);
    alerts.push({
      tipo: 'contratto',
      entita: 'contratti',
      entitaId: c.id,
      descrizione: `Contratto ${c.numero}${c.impianto ? ` (${c.impianto.matricola})` : ''} in scadenza${c.rinnovoAutomatico ? ' — rinnovo automatico' : ''}`,
      dataScadenza: c.dataFine!,
      giorniRimanenti: gg,
      livello: gg < 0 ? 'scaduto' : gg <= 30 ? 'critico' : gg <= 60 ? 'attenzione' : 'informativo',
    });
  }

  // ── Visite programmate in ritardo o imminenti ──
  const visite = await prisma.visitaManutenzione.findMany({
    where: { stato: 'PROGRAMMATA', dataProgrammata: { not: null, lte: in30 } },
    include: { impianto: { select: { matricola: true } }, tecnico: { select: { nome: true, cognome: true } } },
  });
  for (const v of visite) {
    const gg = Math.ceil((v.dataProgrammata!.getTime() - now.getTime()) / 86400000);
    alerts.push({
      tipo: 'visita',
      entita: 'visite_manutenzione',
      entitaId: v.id,
      descrizione: `Visita ${v.tipo.toLowerCase()}${v.impianto ? ` ${v.impianto.matricola}` : ''}${v.tecnico ? ` — ${v.tecnico.nome} ${v.tecnico.cognome}` : ''}`,
      dataScadenza: v.dataProgrammata!,
      giorniRimanenti: gg,
      livello: gg < 0 ? 'scaduto' : gg <= 7 ? 'critico' : 'attenzione',
    });
  }

  // ── Verifiche biennali DPR 162/99 in scadenza ──
  const verifiche = await prisma.verificaPeriodica.findMany({
    where: { prossimaScadenza: { not: null, lte: in90 } },
    include: { impianto: { select: { matricola: true } } },
  });
  for (const vf of verifiche) {
    const gg = Math.ceil((vf.prossimaScadenza!.getTime() - now.getTime()) / 86400000);
    alerts.push({
      tipo: 'verifica',
      entita: 'verifiche_periodiche',
      entitaId: vf.id,
      descrizione: `Verifica biennale DPR 162/99${vf.impianto ? ` ${vf.impianto.matricola}` : ''}${vf.organismo ? ` (${vf.organismo})` : ''}`,
      dataScadenza: vf.prossimaScadenza!,
      giorniRimanenti: gg,
      livello: gg < 0 ? 'scaduto' : gg <= 30 ? 'critico' : gg <= 60 ? 'attenzione' : 'informativo',
    });
  }

  // Sort: scaduto first, then by days remaining
  alerts.sort((a, b) => a.giorniRimanenti - b.giorniRimanenti);

  return alerts;
}

// Cron-like function to run daily
export async function eseguiControlloScadenze() {
  console.log('⏰ Controllo scadenze avviato...');
  try {
    const alerts = await controllaScadenze();
    const critici = alerts.filter(a => a.livello === 'scaduto' || a.livello === 'critico');

    if (critici.length > 0) {
      await createAuditLog({
        azione: 'SCADENZA_CHECK',
        entita: 'sistema',
        dettagli: {
          totaleAlert: alerts.length,
          scaduti: alerts.filter(a => a.livello === 'scaduto').length,
          critici: alerts.filter(a => a.livello === 'critico').length,
        },
      });
    }

    console.log(`✅ Controllo completato: ${alerts.length} alert (${critici.length} critici)`);
    return alerts;
  } catch (error) {
    console.error('❌ Errore controllo scadenze:', error);
    return [];
  }
}
