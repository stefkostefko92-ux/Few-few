import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createAuditLog } from '../services/audit';
import { sanitizeForModel, SanitizeError } from '../services/sanitize';
import { can, moduleForEntity } from '../services/permissions';

const prisma = new PrismaClient();

type ModelName = 'impianto' | 'condominio' | 'amministratore' | 'dipendente' |
  'automezzo' | 'cottimista' | 'squadra' | 'articoloMagazzino' |
  'movimentoMagazzino' | 'preventivo' | 'vocePreventivo' |
  'ordineLavoro' | 'fattura' | 'dDT' | 'documento' | 'auditLog' |
  'impiantoMedia' | 'scadenzaImpianto' | 'storicoStato' | 'lavoro' | 'buonoLavoro' |
  'contratto' | 'visitaManutenzione' | 'verificaPeriodica' | 'segnalazione';

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
  const permModule = moduleForEntity(entityName);
  // Permessi dalla matrice centrale (services/permissions.ts)
  const checkPerm = (action: 'view' | 'create' | 'edit' | 'delete') =>
    (req: AuthRequest, res: Response, next: any) => {
      if (!can(req.user?.ruolo, permModule, action)) {
        res.status(403).json({ error: `Il tuo ruolo (${req.user?.ruolo}) non può eseguire "${action}" su "${permModule}"` });
        return;
      }
      next();
    };

  // GET /  — List with pagination, search, filters
  router.get('/', authenticate, checkPerm('view'), async (req: AuthRequest, res: Response) => {
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
  router.get('/:id', authenticate, checkPerm('view'), async (req: AuthRequest, res: Response) => {
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
    router.post('/', authenticate, checkPerm('create'), async (req: AuthRequest, res: Response) => {
      try {
        const data = sanitizeForModel(model, req.body);
        const record = await prismaModel.create({
          data,
          include,
        });

        await createAuditLog({
          azione: 'CREATE',
          entita: entityName,
          entitaId: record.id,
          dettagli: data,
          utenteId: req.user?.id,
          ip: req.ip,
        });

        res.status(201).json(record);
      } catch (error: any) {
        console.error(`POST /${entityName} error:`, error);
        if (error instanceof SanitizeError) {
          res.status(400).json({ error: error.message });
        } else if (error.code === 'P2002') {
          res.status(409).json({ error: 'Record duplicato', campo: error.meta?.target });
        } else if (error.code === 'P2003') {
          res.status(400).json({ error: 'Riferimento non valido (record collegato inesistente)' });
        } else if (error.name === 'PrismaClientValidationError') {
          res.status(400).json({ error: 'Dati non validi: controlla i campi obbligatori' });
        } else {
          res.status(500).json({ error: 'Errore nella creazione' });
        }
      }
    });

    // PUT /:id  — Update
    router.put('/:id', authenticate, checkPerm('edit'), async (req: AuthRequest, res: Response) => {
      try {
        const existing = await prismaModel.findUnique({ where: { id: req.params.id } });
        if (!existing) {
          res.status(404).json({ error: `${entityName} non trovato` });
          return;
        }

        const data = sanitizeForModel(model, req.body);
        const record = await prismaModel.update({
          where: { id: req.params.id },
          data,
          include,
        });

        await createAuditLog({
          azione: 'UPDATE',
          entita: entityName,
          entitaId: record.id,
          dettagli: { prima: existing, dopo: data },
          utenteId: req.user?.id,
          ip: req.ip,
        });

        res.json(record);
      } catch (error: any) {
        if (error instanceof SanitizeError) {
          res.status(400).json({ error: error.message });
        } else if (error.code === 'P2002') {
          res.status(409).json({ error: 'Record duplicato', campo: error.meta?.target });
        } else if (error.code === 'P2003') {
          res.status(400).json({ error: 'Riferimento non valido (record collegato inesistente)' });
        } else if (error.name === 'PrismaClientValidationError') {
          res.status(400).json({ error: 'Dati non validi: controlla i campi obbligatori' });
        } else {
          res.status(500).json({ error: 'Errore nell\'aggiornamento' });
        }
      }
    });

    // DELETE /:id  — Delete
    router.delete('/:id', authenticate, checkPerm('delete'), async (req: AuthRequest, res: Response) => {
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
  const parentPermModule = parentModel === 'fattura' ? 'fatture' : 'preventivi';
  const checkVociEdit = (req: any, res: any, next: any) => {
    if (!can(req.user?.ruolo, parentPermModule, 'edit')) {
      return res.status(403).json({ error: `Il tuo ruolo non può modificare ${parentPermModule}` });
    }
    next();
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // IVA calcolata per voce secondo la sua aliquota (non hardcoded 22%)
  const ricalcolaTotali = async (parentId: string) => {
    const voci = await prismaVoci.findMany({ where: { [parentIdField]: parentId } });
    const totaleNetto = round2(voci.reduce((s: number, v: any) => s + Number(v.totale || 0), 0));
    const totaleIva = round2(voci.reduce((s: number, v: any) =>
      s + Number(v.totale || 0) * (Number(v.aliquotaIva ?? 22) / 100), 0));
    await (prisma as any)[parentModel].update({
      where: { id: parentId },
      data: { totaleNetto, totaleIva, totaleLordo: round2(totaleNetto + totaleIva) },
    });
  };

  const parentExists = async (parentId: string) =>
    !!(await (prisma as any)[parentModel].findUnique({ where: { id: parentId }, select: { id: true } }));

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
  router.post('/:parentId/voci', authenticate, checkVociEdit, async (req: any, res: any) => {
    try {
      if (!(await parentExists(req.params.parentId))) {
        return res.status(404).json({ error: `${parentModel} non trovato` });
      }
      const data = sanitizeForModel(vociModel, req.body);
      const voce = await prismaVoci.create({
        data: { ...data, [parentIdField]: req.params.parentId },
      });
      await ricalcolaTotali(req.params.parentId);
      await createAuditLog({
        azione: 'CREATE', entita: vociModel, entitaId: voce.id, dettagli: data,
        utenteId: req.user?.id, ip: req.ip,
      });
      res.status(201).json(voce);
    } catch (e: any) {
      if (e instanceof SanitizeError) return res.status(400).json({ error: e.message });
      res.status(500).json({ error: 'Errore creazione voce' });
    }
  });

  // PUT /:parentId/voci/:voceId
  router.put('/:parentId/voci/:voceId', authenticate, checkVociEdit, async (req: any, res: any) => {
    try {
      const data = sanitizeForModel(vociModel, req.body);
      const voce = await prismaVoci.update({ where: { id: req.params.voceId }, data });
      await ricalcolaTotali(req.params.parentId);
      await createAuditLog({
        azione: 'UPDATE', entita: vociModel, entitaId: voce.id, dettagli: data,
        utenteId: req.user?.id, ip: req.ip,
      });
      res.json(voce);
    } catch (e: any) {
      if (e instanceof SanitizeError) return res.status(400).json({ error: e.message });
      if (e.code === 'P2025') return res.status(404).json({ error: 'Voce non trovata' });
      res.status(500).json({ error: 'Errore aggiornamento voce' });
    }
  });

  // DELETE /:parentId/voci/:voceId
  router.delete('/:parentId/voci/:voceId', authenticate, checkVociEdit, async (req: any, res: any) => {
    try {
      await prismaVoci.delete({ where: { id: req.params.voceId } });
      await ricalcolaTotali(req.params.parentId);
      await createAuditLog({
        azione: 'DELETE', entita: vociModel, entitaId: req.params.voceId,
        utenteId: req.user?.id, ip: req.ip,
      });
      res.json({ message: 'Voce eliminata' });
    } catch (e: any) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'Voce non trovata' });
      res.status(500).json({ error: 'Errore eliminazione voce' });
    }
  });

  return router;
}
