// Eternal Touch — Public API
import express from 'express';
import geoip from 'geoip-lite';
import rateLimit from 'express-rate-limit';
import { sendContactNotifications } from '../lib/email.js';

const router = express.Router();

// Tight limiter for the contact form specifically. The site-wide apiLimiter
// (5000/15min) is far too loose here: without this, a single IP could flood the
// DB with messages and — once SMTP is live — turn the confirmation email into a
// spam amplifier (a confirmation is sent to the attacker-supplied address).
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                       // 5 submissions / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again in a few minutes.' }
});

// Contact form submission
router.post('/contact', contactLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, subject, message, _gotcha, privacyConsent } = req.body;

    // Honeypot
    if (_gotcha && _gotcha.trim() !== '') {
      return res.status(200).json({ ok: true });
    }

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({ error: req.t('common.error') });
    }
    if (name.length > 100 || email.length > 200 || message.length > 5000 ||
        (subject && subject.length > 200) || (phone && phone.length > 50)) {
      return res.status(400).json({ error: 'Invalid input length' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // GDPR — the user must acknowledge the Privacy Policy before sending.
    // NB: replying to a contact request rests on Art. 6(1)(b) (pre-contractual
    // steps) / 6(1)(f) (legitimate interest), NOT on consent — the checkbox is
    // an *acknowledgement* of the policy, kept for accountability (Art. 5(2)),
    // not a 6(1)(a) consent that could later be withdrawn to erase the enquiry.
    if (!privacyConsent || privacyConsent !== 'yes') {
      return res.status(400).json({ error: req.t('contact.privacyRequired') });
    }

    // Country (from IP) is derived only for language/routing context and stored
    // in the `source` column. No IP address and no User-Agent are persisted with
    // the message (data minimisation, Art. 5(1)(c)); those stay in short-lived
    // server logs only.
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? forwarded.split(',')[0].trim() : req.ip).replace(/^::ffff:/, '');
    const geo = geoip.lookup(ip);

    // Minimal accountability trail: only that the policy was acknowledged, and when.
    const consentTimestamp = new Date().toISOString();
    const consentNote = `\n\n---\n[Privacy Policy acknowledged: ${consentTimestamp}]`;

    // Trim once so we use the same value for DB and email
    const cleanName    = name.trim();
    const cleanEmail   = email.trim().toLowerCase();
    const cleanPhone   = phone   ? phone.trim()   : null;
    const cleanSubject = subject ? subject.trim() : null;
    const cleanMessage = message.trim();

    // 1) Save first — never lose a contact even if SMTP is down
    const saved = await req.prisma.contactMessage.create({
      data: {
        name:     cleanName,
        email:    cleanEmail,
        phone:    cleanPhone,
        subject:  cleanSubject,
        message:  cleanMessage + consentNote,
        language: req.lang,
        source:   geo?.country || null
      }
    });

    // 2) Respond to the user immediately — don't make them wait on SMTP
    res.json({ ok: true, message: req.t('common.sent') });

    // 3) Fire-and-forget email notifications (admin + customer confirmation)
    //    Errors are logged inside sendContactNotifications and never propagate.
    sendContactNotifications({
      name:      cleanName,
      email:     cleanEmail,
      phone:     cleanPhone,
      subject:   cleanSubject,
      message:   cleanMessage,
      language:  req.lang,
      source:    geo?.country || null,
      createdAt: saved.createdAt
    }).catch(err => console.warn('[email] unexpected error:', err.message));

  } catch (err) {
    next(err);
  }
});

export default router;
