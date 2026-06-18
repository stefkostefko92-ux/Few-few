import { Users } from '../queries.js';

export function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = Users.byId(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = { id: user.id, username: user.username, role: user.role, name: user.display_name };
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).render('errors/403', { title: 'Достъпът е отказан' });
}
