// Eternal Touch — Admin authentication
import jwt from 'jsonwebtoken';

// Fail-fast: never fall back to a shipped, publicly-known secret. A predictable
// JWT signing key lets anyone forge a valid admin token → full takeover.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET is missing or too short (need ≥32 chars). Refusing to start with an insecure key.');
}

const JWT_ALG = 'HS256'; // pin the algorithm — reject anything else at verify time

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: JWT_ALG }
  );
}

// Does this request expect JSON (an AJAX/fetch call) rather than a full page?
// NB: this router is mounted under /admin, so req.path here is WITHOUT the
// /admin prefix (e.g. /products/:id/toggle-active) — a `req.path` check for
// '/api' never matches. Detect the client's intent instead, so admin fetch()
// endpoints get a 401 JSON they can handle, not a 302 to the HTML login page.
function wantsJson(req) {
  return req.xhr || (req.headers.accept || '').includes('application/json');
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.adminToken;
  if (!token) {
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/admin/login');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
    req.adminUser = payload;
    next();
  } catch (e) {
    res.clearCookie('adminToken');
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.redirect('/admin/login');
  }
}
