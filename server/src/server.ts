import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import characterRoutes from './routes/character';
import inventoryRoutes from './routes/inventory';
import shopRoutes from './routes/shop';
import questRoutes from './routes/quest';
import arenaRoutes from './routes/arena';
import mailRoutes from './routes/mail';
import combatRoutes from './routes/combat';
import accountRoutes from './routes/account';
import huntingRoutes from './routes/hunting';
import dungeonRoutes from './routes/dungeon';
import dailyRoutes from './routes/daily';
import wheelRoutes from './routes/wheel';
import achievementRoutes from './routes/achievements';
import bestiaryRoutes from './routes/bestiary';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';
import setsRoutes from './routes/sets';
import profileRoutes from './routes/profile';
import guildRoutes from './routes/guild';
import paymentsRoutes from './routes/payments';
import marketRoutes from './routes/market';
import { getDb } from './db';
import { geoBlock, getGeoInfo } from './middleware/geo';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(geoBlock);
app.get('/api/geo', getGeoInfo);
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || '*').split(','),
    credentials: false,
  }),
);
app.use(express.json({ limit: '256kb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('tiny'));
}

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/api/auth', authLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Nexus Dominion', version: '0.1.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/character', characterRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/quest', questRoutes);
app.use('/api/arena', arenaRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/combat', combatRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/hunting', huntingRoutes);
app.use('/api/dungeon', dungeonRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/bestiary', bestiaryRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sets', setsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/guild', guildRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/market', marketRoutes);

// Serve client build if present (production)
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Ensure DB is initialized before listening
getDb();

app.listen(PORT, () => {
  console.log(`[Nexus Dominion] Server listening on port ${PORT}`);
});
