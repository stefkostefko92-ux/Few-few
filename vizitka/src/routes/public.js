// Публична визитка: /p/<slug> + QR код, vCard и снимки.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
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

// „Този посетител вече видя визитката в последните 12 часа?“ — БЕЗ бисквитка.
// Бисквитка само за статистиката на собственика не е строго необходима за услугата,
// която посетителят иска (ePrivacy чл. 5(3) → би искала съгласие). Затова помним
// необратим хеш (IP + браузър + визитка, с тайна сол, сменяна при всеки рестарт)
// само в паметта на процеса: нищо на устройството, нищо в базата.
const VIEW_TTL = 12 * 60 * 60 * 1000;
const VIEW_MAX = 50_000;
const viewSalt = crypto.randomBytes(32);
const recentViews = new Map(); // хеш → момент на последното броене

function firstViewIn12h(req, profileId) {
  const now = Date.now();
  const key = crypto
    .createHmac('sha256', viewSalt)
    .update(`${req.ip}|${req.get('user-agent') || ''}|${profileId}`)
    .digest('base64url');
  const at = recentViews.get(key);
  if (at && now - at < VIEW_TTL) return false;
  // Таван на паметта: Map пази реда на вмъкване, най-старите са първи.
  if (recentViews.size >= VIEW_MAX)
    for (const [k, t] of recentViews) {
      if (recentViews.size < VIEW_MAX && now - t < VIEW_TTL) break;
      recentViews.delete(k);
    }
  recentViews.delete(key);
  recentViews.set(key, now);
  return true;
}

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
  if (!isOwner && profile.is_public && firstViewIn12h(req, profile.id))
    db.prepare('UPDATE profiles SET views = views + 1 WHERE id = ?').run(profile.id);
  // Описанието е това, което Google показва под заглавието. „Фотограф · +359…“ (24 знака)
  // не казва какво има на страницата — затова: кой е, с какво се занимава и какво може
  // посетителят да направи тук. Телефонът не влиза, за да остане място за това в
  // ~160-те знака; на самата визитка е на един клик.
  const who = [profile.headline, profile.company].filter(Boolean).join(', ');
  const description =
    `${profile.display_name}${who ? ` — ${who}` : ''}. Контакти в дигитална визитка с QR код: обади се, пиши или запази контакта в телефона с един бутон.`.slice(
      0,
      160
    );
  res.render('card', {
    title: profile.display_name,
    // Темата се носи и от <body>, за да оцвети страницата около картата.
    bodyClass: `card-theme ${profile.accent ? 'custom-accent' : `theme-${profile.theme}`}`,
    profile,
    links: getLinks(profile.id),
    accentCss: accentCss(profile.accent),
    isOwner,
    publicUrl,
    wallet: walletLinks(profile, { preview: isOwner || Boolean(req.user?.is_admin) }),
    jsonLd: profile.is_public ? cardJsonLd(profile, publicUrl, baseUrl(req)) : null,
    pageMeta: {
      description,
      // Профилните думи са първи (те носят намерението „търся този човек/фирма“),
      // после общите за продукта. Правилото на репото иска ≥5 и задължително
      // „Carbon Stealth“ — при празен headline/company профилните са само един, затова
      // общите НЕ са по избор.
      keywords: [
        profile.display_name,
        profile.headline,
        profile.company,
        'дигитална визитка',
        'визитка с QR код',
        'vCard контакт',
        'контакти',
        'Vizitka',
        'Carbon Stealth',
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
  // Всяко качване получава НОВО случайно име — файл под дадено име никога не се
  // променя, затова кешът може да е вечен (смяна на снимката = нов адрес).
  res.sendFile(join(UPLOADS_DIR, req.params.file), { maxAge: '365d', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

export default router;
