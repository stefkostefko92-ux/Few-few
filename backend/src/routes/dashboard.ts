import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard — Main KPI dashboard
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const in90days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [
      totaleImpianti,
      impiantiAttivi,
      impiantiFermi,
      totaleCondomini,
      totaleDipendenti,
      totaleAutomezzi,
      totaleCottimisti,
      ordiniPerStato,
      preventiviPerStato,
      fattureNonPagate,
      revisioniScadute,
      revisioniIn30gg,
      revisioniIn60gg,
      revisioniIn90gg,
      articoliSottoscorta,
      automezziScadenza,
      ultimiOrdini,
      ultimiPreventivi,
    ] = await Promise.all([
      prisma.impianto.count(),
      prisma.impianto.count({ where: { stato: 'ATTIVO' } }),
      prisma.impianto.count({ where: { stato: { in: ['FERMO', 'FUORI_SERVIZIO'] } } }),
      prisma.condominio.count(),
      prisma.dipendente.count({ where: { attivo: true } }),
      prisma.automezzo.count(),
      prisma.cottimista.count({ where: { attivo: true } }),

      // Ordini per stato
      prisma.ordineLavoro.groupBy({
        by: ['stato'],
        _count: { stato: true },
      }),

      // Preventivi per stato
      prisma.preventivo.groupBy({
        by: ['stato'],
        _count: { stato: true },
      }),

      // Fatture non pagate
      prisma.fattura.count({
        where: { tipo: 'EMESSA', stato: { in: ['EMESSA', 'INVIATA', 'SCADUTA'] } },
      }),

      // Alert revisioni
      prisma.impianto.count({
        where: { prossimaRevisione: { lt: now } },
      }),
      prisma.impianto.count({
        where: { prossimaRevisione: { gte: now, lte: in30days } },
      }),
      prisma.impianto.count({
        where: { prossimaRevisione: { gte: in30days, lte: in60days } },
      }),
      prisma.impianto.count({
        where: { prossimaRevisione: { gte: in60days, lte: in90days } },
      }),

      // Sotto-scorta
      prisma.$queryRaw`
        SELECT COUNT(*) as count FROM articoli_magazzino 
        WHERE quantita <= "sogliaMinima" AND attivo = true
      ` as Promise<any>,

      // Automezzi con scadenze imminenti
      prisma.automezzo.count({
        where: {
          OR: [
            { scadenzaRevisione: { lte: in30days } },
            { scadenzaAssicurazione: { lte: in30days } },
            { scadenzaTagliando: { lte: in30days } },
          ],
        },
      }),

      // Ultimi 5 ordini
      prisma.ordineLavoro.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { impianto: { select: { matricola: true } } },
      }),

      // Ultimi 5 preventivi
      prisma.preventivo.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { amministratore: { select: { nome: true, cognome: true } } },
      }),
    ]);

    const sottoscortaCount = Array.isArray(articoliSottoscorta) && articoliSottoscorta[0]
      ? Number(articoliSottoscorta[0].count)
      : 0;

    res.json({
      contatori: {
        impianti: { totale: totaleImpianti, attivi: impiantiAttivi, fermi: impiantiFermi },
        condomini: totaleCondomini,
        dipendenti: totaleDipendenti,
        automezzi: totaleAutomezzi,
        cottimisti: totaleCottimisti,
      },
      ordini: ordiniPerStato.reduce((acc: any, o: any) => {
        acc[o.stato] = o._count.stato;
        return acc;
      }, {}),
      preventivi: preventiviPerStato.reduce((acc: any, p: any) => {
        acc[p.stato] = p._count.stato;
        return acc;
      }, {}),
      alert: {
        revisioniScadute,
        revisioniIn30gg,
        revisioniIn60gg,
        revisioniIn90gg,
        fattureNonPagate,
        articoliSottoscorta: sottoscortaCount,
        automezziScadenza,
      },
      ultimi: {
        ordini: ultimiOrdini,
        preventivi: ultimiPreventivi,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Errore nel caricamento dashboard' });
  }
});

export default router;
