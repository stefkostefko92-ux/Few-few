import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Users } from '../queries.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Твърде много опити за вход. Опитайте отново след 15 минути.',
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('admin/login', { layout: false, error: null, username: '' });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const user = username ? Users.byUsername(username.trim()) : null;
  const ok = user && (await bcrypt.compare(password || '', user.password_hash));
  if (!ok) {
    return res.status(401).render('admin/login', {
      layout: false, error: 'Грешно потребителско име или парола.', username: username || '',
    });
  }
  Users.touchLogin(user.id);
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('admin/login', { layout: false, error: 'Възникна грешка.', username: '' });
    req.session.userId = user.id;
    const dest = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    res.redirect(dest);
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

export default router;
