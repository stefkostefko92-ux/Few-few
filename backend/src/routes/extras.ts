import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { generaFatturaPDF, generaPreventivoPDF, generaDDTPDF, generaOrdinePDF } from '../services/pdf';
import { generaFatturaPA, validaFatturaPA } from '../services/fatturaPA';
import { sendFatturaEmail, sendPreventivoEmail, sendEmail, isEmailConfigured } from '../services/email';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const router = Router();

// PDF Downloads
router.get('/pdf/fattura/:id', authenticate, async (req: any, res: any) => {
  try { const buf = await generaFatturaPDF(req.params.id); const f = await prisma.fattura.findUnique({ where: { id: req.params.id } });
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="Fattura_${f?.numero||'doc'}.pdf"`); res.send(buf);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get('/pdf/preventivo/:id', authenticate, async (req: any, res: any) => {
  try { const buf = await generaPreventivoPDF(req.params.id); const p = await prisma.preventivo.findUnique({ where: { id: req.params.id } });
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="Preventivo_${p?.numero||'doc'}.pdf"`); res.send(buf);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get('/pdf/ddt/:id', authenticate, async (req: any, res: any) => {
  try { const buf = await generaDDTPDF(req.params.id); const d = await prisma.dDT.findUnique({ where: { id: req.params.id } });
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="DDT_${d?.numero||'doc'}.pdf"`); res.send(buf);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get('/pdf/ordine/:id', authenticate, async (req: any, res: any) => {
  try { const buf = await generaOrdinePDF(req.params.id); const o = await prisma.ordineLavoro.findUnique({ where: { id: req.params.id } });
    res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="Ordine_${o?.numero||'doc'}.pdf"`); res.send(buf);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Email send
router.post('/email/fattura/:id', authenticate, async (req: any, res: any) => {
  try { if (!isEmailConfigured()) return res.status(503).json({ error: 'SMTP non configurato' });
    const { to } = req.body; if (!to) return res.status(400).json({ error: 'Email destinatario richiesta' });
    const f = await prisma.fattura.findUnique({ where: { id: req.params.id }, include: { amministratore: true } }); if (!f) return res.status(404).json({ error: 'Fattura non trovata' });
    const pdf = await generaFatturaPDF(req.params.id); const ok = await sendFatturaEmail(to, f, pdf);
    res.json({ ok, message: ok ? `Inviata a ${to}` : 'Invio fallito' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/email/preventivo/:id', authenticate, async (req: any, res: any) => {
  try { if (!isEmailConfigured()) return res.status(503).json({ error: 'SMTP non configurato' });
    const { to } = req.body; if (!to) return res.status(400).json({ error: 'Email destinatario richiesta' });
    const p = await prisma.preventivo.findUnique({ where: { id: req.params.id }, include: { amministratore: true } }); if (!p) return res.status(404).json({ error: 'Preventivo non trovato' });
    const pdf = await generaPreventivoPDF(req.params.id); const ok = await sendPreventivoEmail(to, p, pdf);
    res.json({ ok, message: ok ? `Inviato a ${to}` : 'Invio fallito' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post('/email/test', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try { if (!isEmailConfigured()) return res.status(503).json({ error: 'SMTP non configurato' });
    const ok = await sendEmail(req.body.to||req.user?.email, 'Test ERP Ascensori', '<p>Email di test OK!</p>');
    res.json({ ok });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get('/email/status', authenticate, (_r: any, res: any) => {
  res.json({ configured: isEmailConfigured(), host: process.env.SMTP_HOST||null });
});

// FatturaPA SDI
router.get('/sdi/fattura/:id', authenticate, async (req: any, res: any) => {
  try { const v = await validaFatturaPA(req.params.id); if (!v.valid) return res.status(400).json(v);
    const xml = await generaFatturaPA(req.params.id); const f = await prisma.fattura.findUnique({ where: { id: req.params.id } });
    res.setHeader('Content-Type','application/xml'); res.setHeader('Content-Disposition',`attachment; filename="IT${process.env.AZIENDA_PIVA||'00000'}_${f?.numero||'doc'}.xml"`); res.send(xml);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get('/sdi/valida/:id', authenticate, async (req: any, res: any) => {
  try { res.json(await validaFatturaPA(req.params.id)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
