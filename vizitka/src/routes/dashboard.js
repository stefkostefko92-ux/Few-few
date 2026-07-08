// Табло: редакция на профила, слъга, видимостта и снимката.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { requireAuth } from '../auth.js';
import { csrfProtect } from '../csrf.js';
import { isValidSlug } from '../slug.js';
import { baseUrl } from '../config.js';
import { THEMES, normalizeTheme } from '../themes.js';
import {
  AVATAR_SHAPES,
  FONTS,
  normalizeShape,
  normalizeFont,
  normalizeAccent,
} from '../personalize.js';
import { MAX_LINKS, getLinks, replaceLinks, parseLinkFields } from '../links.js';
import { submitUrls } from '../indexnow.js';

const router = Router();

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(PHOTO_EXT[file.mimetype])),
});

const getProfile = (userId) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

function deletePhotoFile(filename) {
  if (!filename) return;
  const path = join(UPLOADS_DIR, filename);
  if (fs.existsSync(path)) fs.unlinkSync(path);
}

const renderDashboard = (req, res, profile, extra = {}) =>
  res.render('dashboard', {
    title: 'Моята визитка',
    profile,
    links: getLinks(profile.id),
    themes: THEMES,
    shapes: AVATAR_SHAPES,
    fonts: FONTS,
    maxLinks: MAX_LINKS,
    publicUrl: `${baseUrl(req)}/p/${profile.slug}`,
    saved: req.query.saved === '1',
    passwordChanged: req.query.pw === '1',
    error: null,
    ...extra,
  });

router.get('/dashboard', requireAuth, (req, res) => {
  renderDashboard(req, res, getProfile(req.user.id));
});

const TEXT_FIELDS = [
  ['display_name', 100],
  ['headline', 120],
  ['company', 100],
  ['phone', 30],
  ['contact_email', 254],
  ['website', 200],
  ['address', 200],
  ['bio', 600],
  ['facebook', 200],
  ['instagram', 200],
  ['linkedin', 200],
];

router.post('/profile', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  const fields = {};
  for (const [name, max] of TEXT_FIELDS)
    fields[name] = String(req.body[name] || '')
      .trim()
      .slice(0, max);
  const type = req.body.type === 'company' ? 'company' : 'personal';
  const isPublic = req.body.is_public === '1' ? 1 : 0;
  const theme = normalizeTheme(req.body.theme);
  const accent = normalizeAccent(req.body.accent);
  const avatarShape = normalizeShape(req.body.avatar_shape);
  const font = normalizeFont(req.body.font);
  const slug = String(req.body.slug || '')
    .trim()
    .toLowerCase();
  const parsed = parseLinkFields(req.body);

  const fail = (error) =>
    renderDashboard(
      req,
      res.status(400),
      {
        ...profile,
        ...fields,
        type,
        is_public: isPublic,
        theme,
        accent,
        avatar_shape: avatarShape,
        font,
        slug,
      },
      { error }
    );

  if (fields.display_name.length < 2) return fail('Името е задължително (поне 2 знака).');
  if (!isValidSlug(slug))
    return fail('Невалиден адрес: 3–40 знака, само малки латински букви, цифри и тире.');
  const clash = db
    .prepare('SELECT 1 FROM profiles WHERE slug = ? AND user_id != ?')
    .get(slug, req.user.id);
  if (clash) return fail('Този адрес вече е зает. Избери друг.');
  for (const url of [fields.website, fields.facebook, fields.instagram, fields.linkedin]) {
    if (url && !/^https?:\/\//i.test(url))
      return fail('Линковете трябва да започват с http:// или https://.');
  }
  if (parsed.error) return fail(parsed.error);

  db.prepare(
    `UPDATE profiles SET
       slug = @slug, type = @type, display_name = @display_name, headline = @headline,
       company = @company, phone = @phone, contact_email = @contact_email, website = @website,
       address = @address, bio = @bio, facebook = @facebook, instagram = @instagram,
       linkedin = @linkedin, is_public = @is_public, theme = @theme, accent = @accent,
       avatar_shape = @avatar_shape, font = @font, updated_at = datetime('now')
     WHERE user_id = @user_id`
  ).run({
    ...fields,
    slug,
    type,
    is_public: isPublic,
    theme,
    accent,
    avatar_shape: avatarShape,
    font,
    user_id: req.user.id,
  });
  replaceLinks(profile.id, parsed.links);

  // Уведоми търсачките (Bing и др.) за новата/променена публична визитка.
  if (isPublic) {
    const base = baseUrl(req);
    submitUrls(base, [`${base}/p/${slug}`]);
  }

  res.redirect('/dashboard?saved=1');
});

router.post('/profile/photo', requireAuth, upload.single('photo'), csrfProtect, (req, res) => {
  if (!req.file) return res.redirect('/dashboard');
  const profile = getProfile(req.user.id);
  const filename = `${crypto.randomBytes(16).toString('hex')}.${PHOTO_EXT[req.file.mimetype]}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), req.file.buffer);
  deletePhotoFile(profile.photo);
  db.prepare("UPDATE profiles SET photo = ?, updated_at = datetime('now') WHERE user_id = ?").run(
    filename,
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

router.post('/profile/photo/delete', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  deletePhotoFile(profile.photo);
  db.prepare("UPDATE profiles SET photo = '', updated_at = datetime('now') WHERE user_id = ?").run(
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

// Корична (заглавна) снимка — фон зад името на визитката.
router.post('/profile/cover', requireAuth, upload.single('cover'), csrfProtect, (req, res) => {
  if (!req.file) return res.redirect('/dashboard');
  const profile = getProfile(req.user.id);
  const filename = `${crypto.randomBytes(16).toString('hex')}.${PHOTO_EXT[req.file.mimetype]}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), req.file.buffer);
  deletePhotoFile(profile.cover);
  db.prepare("UPDATE profiles SET cover = ?, updated_at = datetime('now') WHERE user_id = ?").run(
    filename,
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

router.post('/profile/cover/delete', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  deletePhotoFile(profile.cover);
  db.prepare("UPDATE profiles SET cover = '', updated_at = datetime('now') WHERE user_id = ?").run(
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

export default router;
