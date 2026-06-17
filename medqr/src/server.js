import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { attachUser } from './auth.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import emergencyRoutes from './routes/emergency.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

// Зад reverse proxy (за коректен protocol/IP в продукция).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(join(__dirname, '..', 'public')));
app.use(attachUser);

// Лимит срещу брутфорс по чувствителните маршрути.
const tightLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use(['/login', '/register'], tightLimiter);
const emergencyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.use('/e', emergencyLimiter);

app.get('/', (req, res) => {
  res.render('home', { user: req.user });
});

app.use(authRoutes);
app.use(profileRoutes);
app.use(emergencyRoutes);

app.use((req, res) => {
  res.status(404).render('emergency-error', { message: 'Страницата не е намерена.' });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`MedQR слуша на http://localhost:${PORT}`);
  });
}

export default app;
