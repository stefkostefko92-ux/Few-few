import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const router = Router();
const prisma = new PrismaClient();

// POST /api/contratti/:id/genera-visite
// Genera le visite programmate distribuite uniformemente sul periodo contrattuale
router.post('/:id/genera-visite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const contratto = await prisma.contratto.findUnique({ where: { id: req.params.id } });
    if (!contratto) {
      res.status(404).json({ error: 'Contratto non trovato' });
      return;
    }

    const n = Math.max(1, Math.min(52, contratto.visiteAnno || 2));
    const start = contratto.dataInizio || new Date();
    const end = contratto.dataFine || new Date(start.getTime() + 365 * 86400000);
    if (end <= start) {
      res.status(400).json({ error: 'Periodo contrattuale non valido (data fine prima della data inizio)' });
      return;
    }

    const esistenti = await prisma.visitaManutenzione.findMany({
      where: { contrattoId: contratto.id, stato: 'PROGRAMMATA' },
      select: { dataProgrammata: true },
    });

    const now = new Date();
    const step = (end.getTime() - start.getTime()) / n;
    const create: any[] = [];
    let saltate = 0;

    for (let i = 0; i < n; i++) {
      const data = new Date(start.getTime() + step * (i + 0.5));
      if (data < now) { saltate++; continue; } // niente visite nel passato
      // evita doppioni: già programmata entro ±15 giorni
      const doppione = esistenti.some(e =>
        e.dataProgrammata && Math.abs(e.dataProgrammata.getTime() - data.getTime()) < 15 * 86400000);
      if (doppione) { saltate++; continue; }
      create.push({
        tipo: 'ORDINARIA',
        stato: 'PROGRAMMATA',
        dataProgrammata: data,
        descrizione: `Visita periodica ${i + 1}/${n} — contratto ${contratto.numero}`,
        impiantoId: contratto.impiantoId,
        contrattoId: contratto.id,
      });
    }

    if (create.length > 0) {
      await prisma.visitaManutenzione.createMany({ data: create });
    }

    await createAuditLog({
      azione: 'GENERA_VISITE',
      entita: 'contratti',
      entitaId: contratto.id,
      dettagli: { create: create.length, saltate, visiteAnno: n },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.json({
      create: create.length,
      saltate,
      message: create.length > 0
        ? `${create.length} visite programmate per il contratto ${contratto.numero}${saltate ? ` (${saltate} saltate: passate o già esistenti)` : ''}`
        : 'Nessuna nuova visita da programmare (date passate o già esistenti)',
    });
  } catch (e: any) {
    console.error('genera-visite error:', e.message);
    res.status(500).json({ error: 'Errore generazione visite' });
  }
});

// POST /api/contratti/:id/genera-fattura
// Crea la fattura (bozza) del canone annuale del contratto
router.post('/:id/genera-fattura', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const contratto = await prisma.contratto.findUnique({
      where: { id: req.params.id },
      include: { impianto: { select: { matricola: true } } },
    });
    if (!contratto) {
      res.status(404).json({ error: 'Contratto non trovato' });
      return;
    }
    const canone = Number(contratto.canoneAnnuo || 0);
    if (canone <= 0) {
      res.status(400).json({ error: 'Canone annuo non impostato sul contratto' });
      return;
    }

    const anno = new Date().getFullYear();
    const oggetto = `Canone manutenzione contratto ${contratto.numero} — anno ${anno}`;

    const giaEmessa = await prisma.fattura.findFirst({ where: { oggetto } });
    if (giaEmessa) {
      res.status(409).json({ error: `Fattura canone ${anno} già presente: ${giaEmessa.numero}` });
      return;
    }

    // Numero progressivo FT-{anno}-NNN con retry su collisione
    let fattura: any = null;
    let seq = (await prisma.fattura.count({ where: { numero: { startsWith: `FT-${anno}-` } } })) + 1;
    for (let tentativo = 0; tentativo < 5 && !fattura; tentativo++, seq++) {
      try {
        const round2 = (x: number) => Math.round(x * 100) / 100;
        fattura = await prisma.fattura.create({
          data: {
            numero: `FT-${anno}-${String(seq).padStart(3, '0')}`,
            tipo: 'EMESSA',
            stato: 'BOZZA',
            oggetto,
            note: contratto.impianto ? `Impianto ${contratto.impianto.matricola}` : null,
            totaleNetto: canone,
            totaleIva: round2(canone * 0.22),
            totaleLordo: round2(canone * 1.22),
            dataScadenza: new Date(Date.now() + 30 * 86400000),
            amministratoreId: contratto.amministratoreId,
            utenteId: req.user?.id,
          },
        });
      } catch (e: any) {
        if (e.code !== 'P2002') throw e;
      }
    }
    if (!fattura) {
      res.status(500).json({ error: 'Impossibile generare un numero fattura univoco' });
      return;
    }

    await createAuditLog({
      azione: 'GENERA_FATTURA_CANONE',
      entita: 'contratti',
      entitaId: contratto.id,
      dettagli: { fattura: fattura.numero, canone },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.status(201).json({
      fattura,
      message: `Fattura ${fattura.numero} creata in bozza (€ ${canone.toLocaleString('it-IT')} + IVA)`,
    });
  } catch (e: any) {
    console.error('genera-fattura error:', e.message);
    res.status(500).json({ error: 'Errore generazione fattura' });
  }
});

export default router;
