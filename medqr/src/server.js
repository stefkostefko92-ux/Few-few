import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { attachUser } from './auth.js';
import { csrf } from './csrf.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import emergencyRoutes from './routes/emergency.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.set('trust proxy', 1); // зад reverse proxy (Hetzner) за коректен protocol/IP
app.disable('x-powered-by');

// Администратор на данните — показва се във футъра и в Политиката за поверителност.
const COMPANY = { name: 'CarbonStealth VCC', url: 'https://carbonstealth.eu' };
app.use((req, res, next) => {
  res.locals.company = COMPANY;
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: prod ? [] : null,
      },
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// Принудителен HTTPS в продукция (зад прокси, по X-Forwarded-Proto).
if (prod) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(join(__dirname, '..', 'public')));
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});
app.use(csrf);

// Лимити срещу брутфорс.
app.use(
  ['/login', '/register', '/2fa', '/forgot', '/reset'],
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 })
);
app.use('/e', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

app.get('/', (req, res) => res.render('home', { user: req.user }));
app.get('/privacy', (req, res) => res.render('privacy', { user: req.user }));
app.get('/terms', (req, res) => res.render('terms', { user: req.user }));

app.use(authRoutes);
app.use(profileRoutes);
app.use(emergencyRoutes);

app.use((req, res) =>
  res.status(404).render('emergency-error', { message: 'Страницата не е намерена.', user: req.user })
);

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`MedQR слуша на http://localhost:${PORT}`));
}

export default app;
