import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import ordiniWorkflowRoutes from './routes/ordini';
import aiRoutes from './routes/ai';
import magazzinoRoutes from './routes/magazzino';
import { createCrudRouter, createVociRouter } from './routes/crud';
import { sanitizeForModel } from './services/sanitize';
import uploadRouter, { UPLOAD_DIR } from './routes/upload';
import jwtSocket from 'jsonwebtoken';
import contrattiWorkflowRoutes from './routes/contratti';
import segnalazioniWorkflowRoutes from './routes/segnalazioni';
import { controllaScadenze, eseguiControlloScadenze } from './services/scadenze';
import extrasRoutes from './routes/extras';
import { authenticate, authorize } from './middleware/auth';
import { createAuditLog } from './services/audit';

// In produzione i segreti JWT devono essere impostati e non di default
if (process.env.NODE_ENV === 'production') {
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = process.env[name] || '';
    if (!v || v.includes('change-me') || v.length < 16) {
      console.error(`❌ ${name} mancante o debole: imposta un valore casuale (min 16 caratteri) nel file .env`);
      process.exit(1);
    }
  }
}

const app = express();
const httpServer = createServer(app);

// Il frontend è servito same-origin tramite proxy (nginx/Vite): cross-origin
// è consentito solo agli origin elencati in ALLOWED_ORIGINS (CSV)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  credentials: true,
};

const io = new SocketIO(httpServer, {
  cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : true, methods: ['GET', 'POST'] },
});

const PORT = parseInt(process.env.PORT || '4000');

// ═══════════════════════════════════════════════════════
// MIDDLEWARE GLOBALI
// ═══════════════════════════════════════════════════════
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Troppi tentativi di login. Riprova tra 15 minuti.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Troppe richieste. Riprova tra un minuto.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Limite richieste AI raggiunto. Riprova tra un minuto.' },
});

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Upload file (foto impianti, documenti allegati)
app.use('/api/upload', apiLimiter, uploadRouter);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1y', immutable: true }));

// Auth
app.use('/api/auth', loginLimiter, authRoutes);

// Dashboard
app.use('/api/dashboard', apiLimiter, dashboardRoutes);

// AI Assistant
app.use('/api/ai', aiLimiter, aiRoutes);

// Magazzino movements with stock update
app.use('/api/magazzino-movimenti', apiLimiter, magazzinoRoutes);

// ── Modulo 1: Impianti ──
app.use('/api/impianti', apiLimiter, createCrudRouter({
  model: 'impianto',
  entityName: 'impianti',
  searchFields: ['matricola', 'marca', 'modello', 'indirizzo', 'zona'],
  include: {
    condominio: { select: { id: true, nome: true } },
    amministratore: { select: { id: true, nome: true, cognome: true } },
    _count: { select: { ordiniLavoro: true, media: true } },
  },
}));

// ── Modulo 2: Condomini ──
app.use('/api/condomini', apiLimiter, createCrudRouter({
  model: 'condominio',
  entityName: 'condomini',
  searchFields: ['nome', 'indirizzo', 'citta'],
  include: {
    amministratore: { select: { id: true, nome: true, cognome: true } },
    _count: { select: { impianti: true } },
  },
}));

// ── Modulo 3: Amministratori ──
app.use('/api/amministratori', apiLimiter, createCrudRouter({
  model: 'amministratore',
  entityName: 'amministratori',
  searchFields: ['nome', 'cognome', 'ragioneSociale', 'email'],
  include: {
    _count: { select: { condomini: true, impianti: true } },
  },
}));

// ── Modulo 4: Dipendenti ──
app.use('/api/dipendenti', apiLimiter, createCrudRouter({
  model: 'dipendente',
  entityName: 'dipendenti',
  searchFields: ['nome', 'cognome', 'email'],
  include: {
    _count: { select: { assegnazioni: true, ordiniLavoro: true } },
  },
}));

// ── Modulo 5: Automezzi ──
app.use('/api/automezzi', apiLimiter, createCrudRouter({
  model: 'automezzo',
  entityName: 'automezzi',
  searchFields: ['targa', 'marca', 'modello'],
  include: {
    conducente: { select: { id: true, nome: true, cognome: true } },
  },
}));

// ── Modulo 6: Cottimisti ──
app.use('/api/cottimisti', apiLimiter, createCrudRouter({
  model: 'cottimista',
  entityName: 'cottimisti',
  searchFields: ['ragioneSociale', 'email'],
  include: {
    squadre: true,
    _count: { select: { ordiniLavoro: true } },
  },
}));

app.use('/api/squadre', apiLimiter, createCrudRouter({
  model: 'squadra',
  entityName: 'squadre',
  searchFields: ['nome', 'capocantiere'],
  include: { cottimista: { select: { id: true, ragioneSociale: true } } },
}));

// ── Modulo 7-8: Magazzino ──
app.use('/api/magazzino', apiLimiter, createCrudRouter({
  model: 'articoloMagazzino',
  entityName: 'articoli_magazzino',
  searchFields: ['codice', 'barcode', 'nome', 'descrizione', 'categoria'],
}));

app.use('/api/movimenti', apiLimiter, createCrudRouter({
  model: 'movimentoMagazzino',
  entityName: 'movimenti_magazzino',
  include: {
    articolo: { select: { id: true, codice: true, nome: true } },
  },
}));

// ── Segnalazioni guasti (centralino 24h) ──
app.use('/api/segnalazioni', apiLimiter, createCrudRouter({
  model: 'segnalazione',
  entityName: 'segnalazioni',
  searchFields: ['numero', 'segnalante', 'telefono', 'descrizione'],
  include: {
    impianto: { select: { id: true, matricola: true, indirizzo: true, zona: true } },
    ordineLavoro: { select: { id: true, numero: true, stato: true } },
  },
}));
app.use('/api/segnalazioni', apiLimiter, segnalazioniWorkflowRoutes);

// ── Contratti di Manutenzione ──
app.use('/api/contratti', apiLimiter, createCrudRouter({
  model: 'contratto',
  entityName: 'contratti',
  searchFields: ['numero', 'tipo', 'note'],
  include: {
    impianto: { select: { id: true, matricola: true, marca: true, modello: true, indirizzo: true } },
    amministratore: { select: { id: true, nome: true, cognome: true, ragioneSociale: true } },
    _count: { select: { visite: true } },
  },
}));

app.use('/api/contratti', apiLimiter, contrattiWorkflowRoutes);

// ── Visite di Manutenzione (giri programmati DPR 162/99) ──
app.use('/api/visite', apiLimiter, createCrudRouter({
  model: 'visitaManutenzione',
  entityName: 'visite_manutenzione',
  searchFields: ['descrizione', 'anomalie', 'esito'],
  include: {
    impianto: { select: { id: true, matricola: true, indirizzo: true, zona: true } },
    contratto: { select: { id: true, numero: true } },
    tecnico: { select: { id: true, nome: true, cognome: true } },
  },
}));

// ── Verifiche Periodiche biennali (Organismo Abilitato) ──
app.use('/api/verifiche', apiLimiter, createCrudRouter({
  model: 'verificaPeriodica',
  entityName: 'verifiche_periodiche',
  searchFields: ['organismo', 'esito', 'prescrizioni'],
  include: {
    impianto: { select: { id: true, matricola: true, marca: true, modello: true, indirizzo: true } },
  },
}));

// ── Programma Lavori ──
app.use('/api/lavori', apiLimiter, createCrudRouter({
  model: 'lavoro',
  entityName: 'lavori',
  searchFields: ['commessa', 'ordine', 'indirizzo', 'matricola', 'cliente', 'cottimista', 'tecnico', 'oggetto'],
}));

// ── Buoni di Lavoro (PO-05-3) ──
app.use('/api/buoni-lavoro', apiLimiter, createCrudRouter({
  model: 'buonoLavoro',
  entityName: 'buoni_lavoro',
  searchFields: ['numero', 'commessa', 'matricola', 'ubicazione', 'cottimista', 'tecnicoCapo'],
}));

// ── Modulo 9: Preventivi ──
app.use('/api/preventivi', apiLimiter, createCrudRouter({
  model: 'preventivo',
  entityName: 'preventivi',
  searchFields: ['numero', 'oggetto'],
  include: {
    impianto: { select: { id: true, matricola: true } },
    amministratore: { select: { id: true, nome: true, cognome: true } },
    voci: true,
    _count: { select: { ordiniLavoro: true } },
  },
}));

// ── Voci Preventivo ──
app.use('/api/preventivi', apiLimiter, createVociRouter('preventivo', 'vocePreventivo', 'preventivoId'));

// ── Voci Fattura ──
app.use('/api/fatture', apiLimiter, createVociRouter('fattura', 'voceFattura', 'fatturaId'));

// ── Modulo 10: Ordini di Lavoro ──
app.use('/api/ordini', apiLimiter, createCrudRouter({
  model: 'ordineLavoro',
  entityName: 'ordini_lavoro',
  searchFields: ['numero', 'oggetto'],
  include: {
    impianto: { select: { id: true, matricola: true, indirizzo: true } },
    tecnico: { select: { id: true, nome: true, cognome: true } },
    cottimista: { select: { id: true, ragioneSociale: true } },
    squadra: { select: { id: true, nome: true } },
    preventivo: { select: { id: true, numero: true } },
    _count: { select: { storicoStati: true, fatture: true, ddt: true } },
  },
}));
app.use('/api/ordini', apiLimiter, ordiniWorkflowRoutes);

// ── Modulo 11: Fatturazione ──
app.use('/api/fatture', apiLimiter, createCrudRouter({
  model: 'fattura',
  entityName: 'fatture',
  searchFields: ['numero', 'oggetto'],
  include: {
    amministratore: { select: { id: true, nome: true, cognome: true } },
    ordineLavoro: { select: { id: true, numero: true } },
    vociFattura: true,
  },
}));

// ── Modulo 12: DDT ──
app.use('/api/ddt', apiLimiter, createCrudRouter({
  model: 'dDT',
  entityName: 'ddt',
  searchFields: ['numero', 'destinatario'],
  include: {
    ordineLavoro: { select: { id: true, numero: true } },
    righe: true,
  },
}));

// ── Modulo 13: Documenti ──
app.use('/api/documenti', apiLimiter, createCrudRouter({
  model: 'documento',
  entityName: 'documenti',
  searchFields: ['titolo', 'contenuto'],
}));

// ── Modulo 15: Audit Log (read-only) ──
app.use('/api/audit', apiLimiter, createCrudRouter({
  model: 'auditLog',
  entityName: 'audit_log',
  readOnly: true,
  searchFields: ['azione', 'entita'],
  orderBy: { createdAt: 'desc' },
}));

// ── Users Management ──
import { PrismaClient as PC2 } from '@prisma/client';
import bcryptUsers from 'bcrypt';
const prismaUsers = new PC2();
const usersRouter = Router();

usersRouter.get('/', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const users = await prismaUsers.user.findMany({
      select: { id: true, email: true, nome: true, cognome: true, ruolo: true, attivo: true, ultimoAccesso: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: users, pagination: { total: users.length } });
  } catch (e) { res.status(500).json({ error: 'Errore caricamento utenti' }); }
});

usersRouter.post('/', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const { email, password, nome, cognome, ruolo } = req.body;
    if (!email || !password || !nome || !cognome) return res.status(400).json({ error: 'Campi obbligatori mancanti' });
    const hashed = await bcryptUsers.hash(password, 10);
    const user = await prismaUsers.user.create({ data: { email, password: hashed, nome, cognome, ruolo: ruolo || 'OPERATORE' } });
    res.status(201).json({ id: user.id, email: user.email, nome: user.nome, cognome: user.cognome, ruolo: user.ruolo, attivo: user.attivo });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email già esistente' });
    res.status(500).json({ error: 'Errore creazione utente' });
  }
});

usersRouter.put('/:id', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const data: any = { nome: req.body.nome, cognome: req.body.cognome, ruolo: req.body.ruolo, attivo: req.body.attivo, email: req.body.email };
    if (req.body.password && req.body.password.length > 0 && !req.body.password.startsWith('••')) {
      data.password = await bcryptUsers.hash(req.body.password, 10);
    }
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const user = await prismaUsers.user.update({ where: { id: req.params.id }, data });
    res.json({ id: user.id, email: user.email, nome: user.nome, cognome: user.cognome, ruolo: user.ruolo, attivo: user.attivo });
  } catch (e) { res.status(500).json({ error: 'Errore aggiornamento utente' }); }
});

usersRouter.delete('/:id', authenticate, authorize('MASTER'), async (req: any, res: any) => {
  try {
    await prismaUsers.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Utente eliminato' });
  } catch (e) { res.status(500).json({ error: 'Errore eliminazione utente' }); }
});

usersRouter.post('/:id/toggle', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const user = await prismaUsers.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    const updated = await prismaUsers.user.update({ where: { id: req.params.id }, data: { attivo: !user.attivo } });
    res.json({ id: updated.id, attivo: updated.attivo });
  } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.use('/api/users', apiLimiter, usersRouter);

// ── AI Config (save/load from env runtime) ──
let runtimeAiConfig: any = { provider: process.env.AI_PROVIDER || 'gemini' };
app.post('/api/ai/save-config', authenticate, authorize('ADMIN'), (req: any, res: any) => {
  const { provider, geminiKey, anthropicKey, openaiKey, geminiModel } = req.body;
  if (provider) { runtimeAiConfig.provider = provider; process.env.AI_PROVIDER = provider; }
  if (geminiKey) { process.env.GEMINI_API_KEY = geminiKey; }
  if (geminiModel) { process.env.GEMINI_MODEL = geminiModel; }
  if (anthropicKey) { process.env.ANTHROPIC_API_KEY = anthropicKey; }
  if (openaiKey) { process.env.OPENAI_API_KEY = openaiKey; }
  res.json({
    message: 'Configurazione AI aggiornata',
    provider: runtimeAiConfig.provider,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
  });
});

// ═══════════════════════════════════════════════════════
// NOTIFICHE — Bell icon real-time alerts
// ═══════════════════════════════════════════════════════
const notificheRouter = Router();
let notificheStore: any[] = [];

const addNotifica = (tipo: string, titolo: string, messaggio: string, link?: string) => {
  const n = { id: `n${Date.now()}`, tipo, titolo, messaggio, link, letta: false, createdAt: new Date().toISOString() };
  notificheStore.unshift(n);
  if (notificheStore.length > 100) notificheStore = notificheStore.slice(0, 100);
  io.emit('notifica', n);
  return n;
};

notificheRouter.get('/', authenticate, (_req: any, res: any) => {
  res.json({ data: notificheStore, nonLette: notificheStore.filter((n: any) => !n.letta).length });
});

notificheRouter.post('/leggi', authenticate, (req: any, res: any) => {
  const { id } = req.body;
  if (id === 'all') { notificheStore.forEach((n: any) => n.letta = true); }
  else { const n = notificheStore.find((n: any) => n.id === id); if (n) n.letta = true; }
  res.json({ ok: true });
});

app.use('/api/notifiche', apiLimiter, notificheRouter);

// ═══════════════════════════════════════════════════════
// PASSWORD RESET
// ═══════════════════════════════════════════════════════
app.post('/api/auth/reset-password', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'userId e newPassword richiesti' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    const hashed = await bcryptUsers.hash(newPassword, 10);
    await prismaUsers.user.update({ where: { id: userId }, data: { password: hashed } });
    addNotifica('SYSTEM', 'Password modificata', `Password utente aggiornata da admin`);
    res.json({ message: 'Password aggiornata' });
  } catch (e) { res.status(500).json({ error: 'Errore reset password' }); }
});

app.post('/api/auth/change-password', authenticate, async (req: any, res: any) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Vecchia e nuova password richieste' });
    const user = await prismaUsers.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    const valid = await bcryptUsers.compare(oldPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Password attuale non corretta' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    const hashed = await bcryptUsers.hash(newPassword, 10);
    await prismaUsers.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ message: 'Password cambiata' });
  } catch (e) { res.status(500).json({ error: 'Errore cambio password' }); }
});

// ═══════════════════════════════════════════════════════
// CSV IMPORT — Bulk data import
// ═══════════════════════════════════════════════════════
app.post('/api/import/:modulo', authenticate, authorize('ADMIN'), async (req: any, res: any) => {
  try {
    const { modulo } = req.params;
    const { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Nessun record da importare' });

    const modelMap: any = {
      impianti: 'impianto', condomini: 'condominio', amministratori: 'amministratore',
      dipendenti: 'dipendente', automezzi: 'automezzo', cottimisti: 'cottimista',
      magazzino: 'articoloMagazzino',
    };
    const model = modelMap[modulo];
    if (!model) return res.status(400).json({ error: `Modulo non supportato: ${modulo}` });

    const prismaModel = (prismaUsers as any)[model];
    let imported = 0, errors: string[] = [];

    for (const record of records) {
      try {
        await prismaModel.create({ data: sanitizeForModel(model, record) });
        imported++;
      } catch (e: any) {
        errors.push(`Riga ${imported + errors.length + 1}: ${e.message?.slice(0, 80)}`);
      }
    }

    addNotifica('IMPORT', `Import ${modulo}`, `${imported} record importati${errors.length > 0 ? `, ${errors.length} errori` : ''}`);
    await createAuditLog({ azione: 'IMPORT', entita: modulo, dettagli: { imported, errors: errors.length }, utenteId: req.user?.id, ip: req.ip });
    res.json({ imported, errors: errors.slice(0, 10), total: records.length });
  } catch (e: any) { res.status(500).json({ error: `Errore import: ${e.message}` }); }
});

// ── Scadenze Alert API ──
app.get('/api/scadenze', apiLimiter, authenticate, async (_req, res) => {
  try {
    const alerts = await controllaScadenze();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Errore controllo scadenze' });
  }
});

// ═══════════════════════════════════════════════════════
// SOCKET.IO — Real-time updates
// ═══════════════════════════════════════════════════════
// Handshake autenticato: il client passa il JWT in socket.handshake.auth.token
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token
      || String(socket.handshake.headers.authorization || '').replace('Bearer ', '');
    jwtSocket.verify(token, process.env.JWT_SECRET || 'erp-ascensori-jwt-secret');
    next();
  } catch {
    next(new Error('Non autenticato'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connesso: ${socket.id}`);

  socket.on('join:dashboard', () => {
    socket.join('dashboard');
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnesso: ${socket.id}`);
  });
});

// Export io for use in routes (emit events on data changes)
export { io };

// ═══════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════
app.use('/api', extrasRoutes);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║   ERP Ascensori Enterprise v1.0.0                     ║
  ║   Server avviato su porta ${PORT}                       ║
  ║   API: http://localhost:${PORT}/api                     ║
  ║   WebSocket: ws://localhost:${PORT}                     ║
  ╚═══════════════════════════════════════════════════════╝
  `);

  // Run scadenze check on startup and then every 24h
  setTimeout(() => eseguiControlloScadenze(), 5000);
  setInterval(() => eseguiControlloScadenze(), 24 * 60 * 60 * 1000);
});
