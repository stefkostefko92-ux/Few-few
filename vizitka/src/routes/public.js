// Публична визитка: /p/<slug> + QR код, vCard и снимки.
import { Router } from 'express';
import QRCode from 'qrcode';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { buildVCard } from '../vcard.js';
import { baseUrl } from '../config.js';
import { cardJsonLd } from '../seo.js';

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
  const isOwner = profile.user_id === req.user?.id;
  const publicUrl = `${baseUrl(req)}/p/${profile.slug}`;
  // Броим само чуждите преглеждания на публична визитка.
  if (!isOwner && profile.is_public) {
    db.prepare('UPDATE profiles SET views = views + 1 WHERE id = ?').run(profile.id);
  }
  const description = [profile.headline, profile.company, profile.phone]
    .filter(Boolean)
    .join(' · ');
  res.render('card', {
    title: profile.display_name,
    profile,
    isOwner,
    publicUrl,
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

// Качените снимки — само валидирани имена от uploads директорията.
router.get('/photo/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.params.file)) return res.status(404).end();
  res.sendFile(join(UPLOADS_DIR, req.params.file), { maxAge: '1d' }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

export default router;
