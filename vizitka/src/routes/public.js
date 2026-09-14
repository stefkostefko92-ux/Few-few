// Публична визитка: /p/<slug> + QR код, vCard и снимки.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { buildVCard } from '../vcard.js';
import { baseUrl } from '../config.js';
import { cardJsonLd } from '../seo.js';
import { accentCss } from '../personalize.js';
import { getLinks } from '../links.js';
import { MASTILKO_URL, mastilkoHandoffUrl, verifyToken, buildPrintPayload } from '../print.js';
import { walletLinks } from '../wallet/index.js';

const router = Router();

// QR и vCard се генерират наново при всяка заявка (PNG ~25 ms, vCard чете снимката
// от диска). Без таван един цикъл по /qr.png е едновременно CPU товар и натиск
// върху базата. Страницата на визитката нарочно НЕ е лимитирана толкова строго.
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Твърде много заявки. Опитай пак след минута.',
});

// Публичен профил или собственикът гледа своя (преглед и при скрита визитка).
function findVisibleProfile(req, slug) {
  const profile = db.prepare('SELECT * FROM profiles WHERE slug = ?').get(slug);
  if (!profile) return null;
  if (!profile.is_public && profile.user_id !== req.user?.id) return null;
  return profile;
}

router.get('/p/:slug', (req, res) => {
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).render('404', { title: 'Няма такава визитка' });
  const isOwner = profile.user_id === req.user?.id;
  const publicUrl = `${baseUrl(req)}/p/${profile.slug}`;
  // Броим само чуждите преглеждания на публична визитка — и то веднъж на посетител
  // за 12 часа. Без това всеки refresh (дори HEAD) надуваше брояча и статистиката
  // на собственика ставаше безсмислена.
  const seenCookie = `vzv${profile.id}`;
  if (!isOwner && profile.is_public && !req.cookies?.[seenCookie]) {
    db.prepare('UPDATE profiles SET views = views + 1 WHERE id = ?').run(profile.id);
    res.cookie(seenCookie, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
      path: `/p/${profile.slug}`,
    });
  }
  const description = [profile.headline, profile.company, profile.phone]
    .filter(Boolean)
    .join(' · ');
  res.render('card', {
    title: profile.display_name,
    profile,
    links: getLinks(profile.id),
    accentCss: accentCss(profile.accent),
    isOwner,
    publicUrl,
    wallet: walletLinks(profile),
    jsonLd: profile.is_public ? cardJsonLd(profile, publicUrl, baseUrl(req)) : null,
    pageMeta: {
      description: description || `Дигитална визитка на ${profile.display_name}`,
      keywords: [
        profile.display_name,
        profile.headline,
        profile.company,
        'дигитална визитка',
        'контакти',
      ]
        .filter(Boolean)
        .join(', '),
      url: publicUrl,
      image: profile.photo ? `${baseUrl(req)}/photo/${profile.photo}` : null,
    },
  });
});

router.get('/p/:slug/qr.png', heavyLimiter, async (req, res) => {
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).end();
  const png = await QRCode.toBuffer(`${baseUrl(req)}/p/${profile.slug}`, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  });
  res.type('png');
  // QR кодът за даден слъг е константен — няма смисъл да се преизчислява при всяко
  // сканиране. `private`, защото скритата визитка не бива да се кешира от прокси.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Disposition', `inline; filename="vizitka-${profile.slug}-qr.png"`);
  res.send(png);
});

// Печатна страница — препраща към партньорския печатен сайт mastilko-bg.com.
router.get('/p/:slug/print', (req, res) => {
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).render('404', { title: 'Няма такава визитка' });
  res.render('print', {
    title: `Печат на визитка — ${profile.display_name}`,
    profile,
    isOwner: profile.user_id === req.user?.id,
    publicUrl: `${baseUrl(req)}/p/${profile.slug}`,
    mastilkoUrl: mastilkoHandoffUrl(profile.slug),
    mastilkoBase: MASTILKO_URL,
  });
});

// API за печатния партньор: връща структурираните данни на визитката по валиден токен.
router.options('/api/print/:token', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', MASTILKO_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.status(204).end();
});

router.get('/api/print/:token', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', MASTILKO_URL);
  res.setHeader('Cache-Control', 'no-store');
  const claim = verifyToken(req.params.token);
  if (!claim) return res.status(401).json({ error: 'Невалиден или изтекъл токен.' });
  const profile = db.prepare('SELECT * FROM profiles WHERE slug = ?').get(claim.slug);
  if (!profile) return res.status(404).json({ error: 'Няма такава визитка.' });
  // Токенът оторизира, но НЕ надживява скриването: скрие ли собственикът визитката,
  // вече издаден токен спира да връща данни (иначе изтичаха до 30 мин след това).
  if (!profile.is_public) return res.status(404).json({ error: 'Няма такава визитка.' });
  res.json(buildPrintPayload(profile, baseUrl(req)));
});

router.get('/p/:slug/vizitka.vcf', heavyLimiter, (req, res) => {
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).end();
  // Вграждаме снимката base64 — контактът работи офлайн, без връзка към сървъра.
  let photo = null;
  if (profile.photo) {
    const path = join(UPLOADS_DIR, profile.photo);
    if (fs.existsSync(path)) {
      photo = { buffer: fs.readFileSync(path), ext: profile.photo.split('.').pop() };
    }
  }
  res.type('text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${profile.slug}.vcf"`);
  res.send(buildVCard(profile, baseUrl(req), photo));
});

// Качените изображения (снимки на профили + рекламни банери) — валидирани имена.
router.get('/photo/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|gif)$/.test(req.params.file)) return res.status(404).end();
  res.sendFile(join(UPLOADS_DIR, req.params.file), { maxAge: '1d' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

export default router;
