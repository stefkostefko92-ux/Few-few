import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const router = Router();
const prisma = new PrismaClient();

// POST /api/segnalazioni/:id/crea-ordine
// Converte la segnalazione in Ordine di Lavoro (priorità mappata dal tipo)
router.post('/:id/crea-ordine', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const seg = await prisma.segnalazione.findUnique({
      where: { id: req.params.id },
      include: { impianto: { select: { matricola: true } } },
    });
    if (!seg) {
      res.status(404).json({ error: 'Segnalazione non trovata' });
      return;
    }
    if (seg.ordineLavoroId) {
      const ord = await prisma.ordineLavoro.findUnique({ where: { id: seg.ordineLavoroId }, select: { numero: true } });
      res.status(409).json({ error: `Ordine già creato: ${ord?.numero || seg.ordineLavoroId}` });
      return;
    }

    // PERSONA_BLOCCATA è sempre emergenza
    const priorita = seg.tipo === 'PERSONA_BLOCCATA' ? 'EMERGENZA' : (seg.priorita as any) || 'ORDINARIA';
    const oggetto = `${seg.tipo.replace(/_/g, ' ')}${seg.impianto ? ` — ${seg.impianto.matricola}` : ''}${seg.descrizione ? `: ${String(seg.descrizione).slice(0, 80)}` : ''}`;

    // Numerazione progressiva OL-NNNNN con retry su collisione
    let ordine: any = null;
    let seq = (await prisma.ordineLavoro.count()) + 1;
    for (let i = 0; i < 5 && !ordine; i++, seq++) {
      try {
        ordine = await prisma.ordineLavoro.create({
          data: {
            numero: `OL-${String(seq).padStart(5, '0')}`,
            oggetto,
            stato: 'EMESSO',
            priorita,
            descrizione: seg.descrizione,
            noteInterne: `Da segnalazione ${seg.numero || seg.id}${seg.segnalante ? ` — segnalante: ${seg.segnalante}${seg.telefono ? ` (${seg.telefono})` : ''}` : ''}`,
            impiantoId: seg.impiantoId,
            utenteId: req.user?.id,
          },
        });
      } catch (e: any) {
        if (e.code !== 'P2002') throw e;
      }
    }
    if (!ordine) {
      res.status(500).json({ error: 'Impossibile generare un numero ordine univoco' });
      return;
    }

    await prisma.segnalazione.update({
      where: { id: seg.id },
      data: { stato: 'IN_GESTIONE', ordineLavoroId: ordine.id },
    });

    await createAuditLog({
      azione: 'SEGNALAZIONE_TO_ORDINE',
      entita: 'segnalazioni',
      entitaId: seg.id,
      dettagli: { ordine: ordine.numero, priorita },
      utenteId: req.user?.id,
      ip: req.ip,
    });

    res.status(201).json({
      ordine,
      message: `Ordine ${ordine.numero} creato (priorità ${priorita}) — segnalazione in gestione`,
    });
  } catch (e: any) {
    console.error('crea-ordine error:', e.message);
    res.status(500).json({ error: 'Errore creazione ordine' });
  }
});

// POST /api/segnalazioni/:id/chiudi
router.post('/:id/chiudi', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const seg = await prisma.segnalazione.findUnique({ where: { id: req.params.id } });
    if (!seg) {
      res.status(404).json({ error: 'Segnalazione non trovata' });
      return;
    }
    const updated = await prisma.segnalazione.update({
      where: { id: seg.id },
      data: { stato: 'CHIUSA', dataChiusura: new Date(), notaChiusura: req.body?.nota || seg.notaChiusura },
    });
    await createAuditLog({
      azione: 'SEGNALAZIONE_CHIUSA', entita: 'segnalazioni', entitaId: seg.id,
      dettagli: { nota: req.body?.nota }, utenteId: req.user?.id, ip: req.ip,
    });
    res.json({ segnalazione: updated, message: 'Segnalazione chiusa' });
  } catch (e: any) {
    res.status(500).json({ error: 'Errore chiusura segnalazione' });
  }
});

export default router;
