import { Router, Response } from 'express';
import { PrismaClient, StatoOrdine } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════
// WORKFLOW: Transizioni valide tra stati
// ═══════════════════════════════════════════════════════
const TRANSIZIONI_VALIDE: Record<StatoOrdine, StatoOrdine[]> = {
  BOZZA: ['EMESSO', 'ANNULLATO'],
  EMESSO: ['CONFERMATO', 'ANNULLATO'],
  CONFERMATO: ['IN_LAVORO', 'SOSPESO', 'ANNULLATO'],
  IN_LAVORO: ['COMPLETATO', 'SOSPESO', 'CONTESTATO'],
  SOSPESO: ['IN_LAVORO', 'ANNULLATO'],
  COMPLETATO: ['CHIUSO', 'CONTESTATO'],
  CHIUSO: [], // stato finale
  CONTESTATO: ['IN_LAVORO', 'ANNULLATO'],
  ANNULLATO: [], // stato finale
};

// POST /:id/stato — Cambio stato con validazione workflow
router.post('/:id/stato', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { statoNuovo, nota } = req.body;
    if (!statoNuovo) {
      res.status(400).json({ error: 'Nuovo stato richiesto' });
      return;
    }

    const ordine = await prisma.ordineLavoro.findUnique({ where: { id: req.params.id } });
    if (!ordine) {
      res.status(404).json({ error: 'Ordine di lavoro non trovato' });
      return;
    }

    // Validate transition
    const transizioniPermesse = TRANSIZIONI_VALIDE[ordine.stato];
    if (!transizioniPermesse.includes(statoNuovo as StatoOrdine)) {
      res.status(400).json({
        error: `Transizione non valida: ${ordine.stato} → ${statoNuovo}`,
        transizioniPermesse,
      });
      return;
    }

    // Update order and create history record
    const [updated] = await prisma.$transaction([
      prisma.ordineLavoro.update({
        where: { id: req.params.id },
        data: { stato: statoNuovo as StatoOrdine },
        include: {
          impianto: true,
          tecnico: true,
          cottimista: true,
          squadra: true,
          preventivo: true,
        },
      }),
      prisma.storicoStato.create({
        data: {
          ordineLavoroId: req.params.id,
          statoPrecedente: ordine.stato,
          statoNuovo: statoNuovo as StatoOrdine,
          nota,
          utente: req.user?.email || 'sistema',
        },
      }),
    ]);

    await createAuditLog({
      azione: 'STATE_CHANGE',
      entita: 'ordini_lavoro',
      entitaId: req.params.id,
      dettagli: { da: ordine.stato, a: statoNuovo, nota },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.json(updated);
  } catch (error) {
    console.error('Stato change error:', error);
    res.status(500).json({ error: 'Errore nel cambio stato' });
  }
});

// GET /:id/storico — Storico stati
router.get('/:id/storico', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const storico = await prisma.storicoStato.findMany({
      where: { ordineLavoroId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(storico);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero storico' });
  }
});

// POST /da-preventivo/:preventivoId — Crea OdL da preventivo approvato
router.post('/da-preventivo/:preventivoId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const preventivo = await prisma.preventivo.findUnique({
      where: { id: req.params.preventivoId },
      include: { voci: true, impianto: true },
    });

    if (!preventivo) {
      res.status(404).json({ error: 'Preventivo non trovato' });
      return;
    }
    if (preventivo.stato !== 'APPROVATO') {
      res.status(400).json({ error: 'Il preventivo deve essere APPROVATO' });
      return;
    }

    // Generate next number
    const lastOrdine = await prisma.ordineLavoro.findFirst({ orderBy: { createdAt: 'desc' } });
    const nextNum = lastOrdine
      ? `OL-${String(parseInt(lastOrdine.numero.replace('OL-', '')) + 1).padStart(5, '0')}`
      : 'OL-00001';

    const ordine = await prisma.ordineLavoro.create({
      data: {
        numero: nextNum,
        oggetto: preventivo.oggetto,
        descrizione: preventivo.descrizione,
        impiantoId: preventivo.impiantoId,
        preventivoId: preventivo.id,
        utenteId: req.user?.id,
        ...req.body,
      },
      include: { impianto: true, preventivo: true },
    });

    await createAuditLog({
      azione: 'CREATE',
      entita: 'ordini_lavoro',
      entitaId: ordine.id,
      dettagli: { daPreventivo: preventivo.numero },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.status(201).json(ordine);
  } catch (error) {
    console.error('Create from preventivo error:', error);
    res.status(500).json({ error: 'Errore nella creazione OdL' });
  }
});

export default router;
