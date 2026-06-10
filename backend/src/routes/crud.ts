import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';

const prisma = new PrismaClient();

type ModelName = 'impianto' | 'condominio' | 'amministratore' | 'dipendente' |
  'automezzo' | 'cottimista' | 'squadra' | 'articoloMagazzino' |
  'movimentoMagazzino' | 'preventivo' | 'vocePreventivo' |
  'ordineLavoro' | 'fattura' | 'dDT' | 'documento' | 'auditLog' |
  'impiantoMedia' | 'scadenzaImpianto' | 'storicoStato';

interface CrudOptions {
  model: ModelName;
  entityName: string;
  include?: any;
  searchFields?: string[];
  orderBy?: any;
  readOnly?: boolean;
}

export function createCrudRouter(options: CrudOptions): Router {
  const router = Router();
  const { model, entityName, include, searchFields, orderBy, readOnly } = options;
  const prismaModel = (prisma as any)[model];

  // GET /  — List with pagination, search, filters
  router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const skip = (page - 1) * limit;
      const search = req.query.search as string;
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';

      const where: any = {};

      // Full-text search across configured fields
      if (search && searchFields?.length) {
        where.OR = searchFields.map(field => ({
          [field]: { contains: search, mode: 'insensitive' },
        }));
      }

      // Dynamic filters from query params
      for (const [key, value] of Object.entries(req.query)) {
        if (['page', 'limit', 'search', 'sortBy', 'sortDir'].includes(key)) continue;
        if (typeof value === 'string' && value.length > 0) {
          // Enum/exact match for known filter fields
          if (key.endsWith('Id') || key === 'stato' || key === 'tipo' || key === 'priorita' || key === 'ruolo') {
            where[key] = value;
          }
        }
      }

      const [data, total] = await Promise.all([
        prismaModel.findMany({
          where,
          include,
          skip,
          take: limit,
          orderBy: orderBy || { [sortBy]: sortDir },
        }),
        prismaModel.count({ where }),
      ]);

      res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error(`GET /${entityName} error:`, error);
      res.status(500).json({ error: 'Errore nel recupero dati' });
    }
  });

  // GET /:id  — Single record
  router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const record = await prismaModel.findUnique({
        where: { id: req.params.id },
        include,
      });
      if (!record) {
        res.status(404).json({ error: `${entityName} non trovato` });
        return;
      }
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: 'Errore nel recupero dati' });
    }
  });

  if (!readOnly) {
    // POST /  — Create
    router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
      try {
        const record = await prismaModel.create({
          data: req.body,
          include,
        });

        await createAuditLog({
          azione: 'CREATE',
          entita: entityName,
          entitaId: record.id,
          dettagli: req.body,
          utenteId: req.user?.id,
          ip: req.ip,
        });

        res.status(201).json(record);
      } catch (error: any) {
        console.error(`POST /${entityName} error:`, error);
        if (error.code === 'P2002') {
          res.status(409).json({ error: 'Record duplicato', campo: error.meta?.target });
        } else {
          res.status(500).json({ error: 'Errore nella creazione' });
        }
      }
    });

    // PUT /:id  — Update
    router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
      try {
        const existing = await prismaModel.findUnique({ where: { id: req.params.id } });
        if (!existing) {
          res.status(404).json({ error: `${entityName} non trovato` });
          return;
        }

        const record = await prismaModel.update({
          where: { id: req.params.id },
          data: req.body,
          include,
        });

        await createAuditLog({
          azione: 'UPDATE',
          entita: entityName,
          entitaId: record.id,
          dettagli: { prima: existing, dopo: req.body },
          utenteId: req.user?.id,
          ip: req.ip,
        });

        res.json(record);
      } catch (error: any) {
        if (error.code === 'P2002') {
          res.status(409).json({ error: 'Record duplicato', campo: error.meta?.target });
        } else {
          res.status(500).json({ error: 'Errore nell\'aggiornamento' });
        }
      }
    });

    // DELETE /:id  — Delete
    router.delete('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
      try {
        const existing = await prismaModel.findUnique({ where: { id: req.params.id } });
        if (!existing) {
          res.status(404).json({ error: `${entityName} non trovato` });
          return;
        }

        await prismaModel.delete({ where: { id: req.params.id } });

        await createAuditLog({
          azione: 'DELETE',
          entita: entityName,
          entitaId: req.params.id,
          dettagli: existing,
          utenteId: req.user?.id,
          ip: req.ip,
        });

        res.json({ message: `${entityName} eliminato` });
      } catch (error) {
        res.status(500).json({ error: 'Errore nell\'eliminazione' });
      }
    });
  }

  return router;
}

// ═══════════════════════════════════════════════════════
// VOCI SUB-RESOURCE — /preventivi/:id/voci, /fatture/:id/voci
// ═══════════════════════════════════════════════════════
import { Router as VociRouter } from 'express';

export function createVociRouter(parentModel: string, vociModel: string, parentIdField: string): VociRouter {
  const router = VociRouter({ mergeParams: true });
  const prismaVoci = (prisma as any)[vociModel];

  // GET /:parentId/voci
  router.get('/:parentId/voci', authenticate, async (req: any, res: any) => {
    try {
      const voci = await prismaVoci.findMany({
        where: { [parentIdField]: req.params.parentId },
        orderBy: { ordine: 'asc' },
      });
      res.json(voci);
    } catch (e) { res.status(500).json({ error: 'Errore caricamento voci' }); }
  });

  // POST /:parentId/voci
  router.post('/:parentId/voci', authenticate, async (req: any, res: any) => {
    try {
      const voce = await prismaVoci.create({
        data: { ...req.body, [parentIdField]: req.params.parentId },
      });
      // Ricalcola totali
      const voci = await prismaVoci.findMany({ where: { [parentIdField]: req.params.parentId } });
      const totaleNetto = voci.reduce((s: number, v: any) => s + Number(v.totale || 0), 0);
      const totaleIva = totaleNetto * 0.22;
      const totaleLordo = totaleNetto + totaleIva;
      await (prisma as any)[parentModel].update({
        where: { id: req.params.parentId },
        data: { totaleNetto, totaleIva, totaleLordo },
      });
      res.status(201).json(voce);
    } catch (e) { res.status(500).json({ error: 'Errore creazione voce' }); }
  });

  // PUT /:parentId/voci/:voceId
  router.put('/:parentId/voci/:voceId', authenticate, async (req: any, res: any) => {
    try {
      const voce = await prismaVoci.update({ where: { id: req.params.voceId }, data: req.body });
      // Ricalcola totali
      const voci = await prismaVoci.findMany({ where: { [parentIdField]: req.params.parentId } });
      const totaleNetto = voci.reduce((s: number, v: any) => s + Number(v.totale || 0), 0);
      const totaleIva = totaleNetto * 0.22;
      await (prisma as any)[parentModel].update({
        where: { id: req.params.parentId },
        data: { totaleNetto, totaleIva, totaleLordo: totaleNetto + totaleIva },
      });
      res.json(voce);
    } catch (e) { res.status(500).json({ error: 'Errore aggiornamento voce' }); }
  });

  // DELETE /:parentId/voci/:voceId
  router.delete('/:parentId/voci/:voceId', authenticate, async (req: any, res: any) => {
    try {
      await prismaVoci.delete({ where: { id: req.params.voceId } });
      const voci = await prismaVoci.findMany({ where: { [parentIdField]: req.params.parentId } });
      const totaleNetto = voci.reduce((s: number, v: any) => s + Number(v.totale || 0), 0);
      const totaleIva = totaleNetto * 0.22;
      await (prisma as any)[parentModel].update({
        where: { id: req.params.parentId },
        data: { totaleNetto, totaleIva, totaleLordo: totaleNetto + totaleIva },
      });
      res.json({ message: 'Voce eliminata' });
    } catch (e) { res.status(500).json({ error: 'Errore eliminazione voce' }); }
  });

  return router;
}
