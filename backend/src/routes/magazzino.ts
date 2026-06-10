import { Router, Response } from 'express';
import { PrismaClient, TipoMovimento } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const router = Router();
const prisma = new PrismaClient();

// POST /api/magazzino-movimenti/movimento — Registra movimento e aggiorna quantità
router.post('/movimento', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { articoloId, tipo, quantita, nota, ddtId } = req.body;

    if (!articoloId || !tipo || !quantita) {
      res.status(400).json({ error: 'articoloId, tipo e quantita richiesti' });
      return;
    }

    if (!['ENTRATA', 'USCITA', 'RETTIFICA'].includes(tipo)) {
      res.status(400).json({ error: 'Tipo deve essere ENTRATA, USCITA o RETTIFICA' });
      return;
    }

    const qta = parseInt(quantita);
    if (isNaN(qta) || qta <= 0) {
      res.status(400).json({ error: 'Quantità deve essere un numero positivo' });
      return;
    }

    const articolo = await prisma.articoloMagazzino.findUnique({ where: { id: articoloId } });
    if (!articolo) {
      res.status(404).json({ error: 'Articolo non trovato' });
      return;
    }

    // Calculate new quantity
    let nuovaQuantita: number;
    if (tipo === 'ENTRATA') {
      nuovaQuantita = articolo.quantita + qta;
    } else if (tipo === 'USCITA') {
      if (articolo.quantita < qta) {
        res.status(400).json({
          error: `Quantità insufficiente. Disponibili: ${articolo.quantita}, richiesti: ${qta}`,
        });
        return;
      }
      nuovaQuantita = articolo.quantita - qta;
    } else {
      // RETTIFICA: set absolute value
      nuovaQuantita = qta;
    }

    // Transaction: create movement + update stock
    const [movimento, articoloAggiornato] = await prisma.$transaction([
      prisma.movimentoMagazzino.create({
        data: {
          articoloId,
          tipo: tipo as TipoMovimento,
          quantita: qta,
          nota,
          ddtId: ddtId || null,
        },
        include: {
          articolo: { select: { id: true, codice: true, nome: true } },
        },
      }),
      prisma.articoloMagazzino.update({
        where: { id: articoloId },
        data: { quantita: nuovaQuantita },
      }),
    ]);

    await createAuditLog({
      azione: 'STOCK_MOVEMENT',
      entita: 'articoli_magazzino',
      entitaId: articoloId,
      dettagli: {
        tipo,
        quantita: qta,
        quantitaPrecedente: articolo.quantita,
        nuovaQuantita,
        nota,
      },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    // Check sotto-scorta alert
    const sottoscorta = nuovaQuantita <= articolo.sogliaMinima;

    res.status(201).json({
      movimento,
      articolo: articoloAggiornato,
      alert: sottoscorta ? {
        tipo: 'SOTTO_SCORTA',
        messaggio: `${articolo.nome} (${articolo.codice}): quantità ${nuovaQuantita} ≤ soglia ${articolo.sogliaMinima}`,
      } : null,
    });
  } catch (error) {
    console.error('Movimento magazzino error:', error);
    res.status(500).json({ error: 'Errore nella registrazione del movimento' });
  }
});

// GET /api/magazzino-movimenti/storico/:articoloId — Storico movimenti per articolo
router.get('/storico/:articoloId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 25);

    const [movimenti, total] = await Promise.all([
      prisma.movimentoMagazzino.findMany({
        where: { articoloId: req.params.articoloId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ddt: { select: { id: true, numero: true } },
        },
      }),
      prisma.movimentoMagazzino.count({ where: { articoloId: req.params.articoloId } }),
    ]);

    res.json({ data: movimenti, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero storico' });
  }
});

// GET /api/magazzino-movimenti/sottoscorta — Articoli sotto soglia minima
router.get('/sottoscorta', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const articoli = await prisma.$queryRaw`
      SELECT id, codice, nome, tipo, categoria, quantita, "sogliaMinima", ubicazione
      FROM articoli_magazzino
      WHERE quantita <= "sogliaMinima" AND attivo = true
      ORDER BY (quantita - "sogliaMinima") ASC
    `;
    res.json(articoli);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero articoli sottoscorta' });
  }
});

// POST /api/magazzino-movimenti/barcode-scan — Ricerca per barcode
router.post('/barcode-scan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      res.status(400).json({ error: 'Barcode richiesto' });
      return;
    }

    const articolo = await prisma.articoloMagazzino.findFirst({
      where: { barcode, attivo: true },
    });

    if (!articolo) {
      res.status(404).json({ error: `Nessun articolo trovato per barcode: ${barcode}` });
      return;
    }

    res.json(articolo);
  } catch (error) {
    res.status(500).json({ error: 'Errore nella ricerca barcode' });
  }
});

export default router;
