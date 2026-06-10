import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createAuditLog } from '../services/audit';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'erp-ascensori-jwt-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'erp-ascensori-refresh-secret';
const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MIN = 15;

function generateTokens(user: any) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, ruolo: user.ruolo, nome: user.nome, cognome: user.cognome },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email e password richiesti' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.attivo) {
      res.status(401).json({ error: 'Credenziali non valide' });
      return;
    }

    // I clienti non hanno accesso alla piattaforma
    if (user.ruolo === 'CLIENTE') {
      res.status(403).json({ error: 'Accesso riservato al personale aziendale' });
      return;
    }

    // Check brute force lock
    if (user.bloccatoFino && user.bloccatoFino > new Date()) {
      const minRimanenti = Math.ceil((user.bloccatoFino.getTime() - Date.now()) / 60000);
      res.status(423).json({ error: `Account bloccato. Riprova tra ${minRimanenti} minuti.` });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      const tentativi = user.tentativi + 1;
      const updateData: any = { tentativi };

      if (tentativi >= MAX_ATTEMPTS) {
        updateData.bloccatoFino = new Date(Date.now() + LOCK_DURATION_MIN * 60000);
        updateData.tentativi = 0;
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      res.status(401).json({
        error: 'Credenziali non valide',
        tentativiRimanenti: Math.max(0, MAX_ATTEMPTS - tentativi),
      });
      return;
    }

    // Success - reset attempts, generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tentativi: 0,
        bloccatoFino: null,
        ultimoAccesso: new Date(),
        refreshToken,
      },
    });

    await createAuditLog({
      azione: 'LOGIN',
      entita: 'users',
      entitaId: user.id,
      utenteId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cognome: user.cognome,
        ruolo: user.ruolo,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token richiesto' });
      return;
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || user.refreshToken !== refreshToken || !user.attivo) {
      res.status(401).json({ error: 'Refresh token non valido' });
      return;
    }

    const tokens = generateTokens(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Refresh token scaduto' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null },
      });

      await createAuditLog({
        azione: 'LOGOUT',
        entita: 'users',
        entitaId: req.user.id,
        utenteId: req.user.id,
        ip: req.ip,
      });
    }
    res.json({ message: 'Logout effettuato' });
  } catch {
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, nome: true, cognome: true, ruolo: true, ultimoAccesso: true },
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Errore interno' });
  }
});

export default router;
