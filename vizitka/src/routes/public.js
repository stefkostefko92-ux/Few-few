// Публична визитка: /p/<slug> + QR код, vCard и снимки.
import { Router } from 'express';
import QRCode from 'qrcode';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { buildVCard } from '../vcard.js';
import { baseUrl } from '../config.js';

const router = Router();

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
  res.render('card', {
    title: profile.display_name,
    profile,
    isOwner: profile.user_id === req.user?.id,
    publicUrl: `${baseUrl(req)}/p/${profile.slug}`,
  });
});

router.get('/p/:slug/qr.png', async (req, res) => {
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
  res.setHeader('Content-Disposition', `inline; filename="vizitka-${profile.slug}-qr.png"`);
  res.send(png);
});

router.get('/p/:slug/vizitka.vcf', (req, res) => {
  const profile = findVisibleProfile(req, req.params.slug);
  if (!profile) return res.status(404).end();
  res.type('text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${profile.slug}.vcf"`);
  res.send(buildVCard(profile, baseUrl(req)));
});

// Качените снимки — само валидирани имена от uploads директорията.
router.get('/photo/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.params.file)) return res.status(404).end();
  res.sendFile(join(UPLOADS_DIR, req.params.file), { maxAge: '1d' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

export default router;
