import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    ruolo: UserRole;
    nome: string;
    cognome: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'erp-ascensori-jwt-secret';

// Role hierarchy: L1=MASTER (highest) → L7=CLIENTE (lowest)
const ROLE_LEVELS: Record<UserRole, number> = {
  MASTER: 1,
  ADMIN: 2,
  DIREZIONE: 3,
  RESPONSABILE: 4,
  TECNICO: 5,
  OPERATORE: 6,
  CLIENTE: 7,
};

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token mancante' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      ruolo: decoded.ruolo,
      nome: decoded.nome,
      cognome: decoded.cognome,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

export function authorize(...ruoliMinimi: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Non autenticato' });
      return;
    }

    const userLevel = ROLE_LEVELS[req.user.ruolo];
    const minLevel = Math.min(...ruoliMinimi.map(r => ROLE_LEVELS[r]));

    if (userLevel > minLevel) {
      res.status(403).json({ error: 'Permessi insufficienti' });
      return;
    }

    next();
  };
}

export { prisma, ROLE_LEVELS };
