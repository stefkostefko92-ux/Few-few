// Табло: редакция на профила, слъга, видимостта и снимката.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { requireAuth } from '../auth.js';
import { csrfProtect } from '../csrf.js';
import { baseUrl } from '../config.js';
import { THEMES } from '../themes.js';
import { AVATAR_SHAPES, FONTS } from '../personalize.js';
import { MAX_LINKS, getLinks } from '../links.js';
import { collectProfileInput, validateProfileInput, saveProfileEdit } from '../profiles.js';
import { prepareUpload } from '../images.js';
import { submitUrls } from '../indexnow.js';
import { notifyWalletUpdate } from '../wallet/index.js';

const router = Router();

// Не филтрираме по клиентския mimetype — той е контролируем и не доказва нищо.
// Форматът се определя от САМИТЕ БАЙТОВЕ в `prepareUpload` след качването, така
// грешният файл получава ясно съобщение вместо тихо да изчезне.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
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

router.post('/profile', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  const input = collectProfileInput(req.body);
  const error = validateProfileInput(input, profile.id);
  if (error)
    return renderDashboard(
      req,
      res.status(400),
      {
        ...profile,
        ...input.fields,
        type: input.type,
        is_public: input.isPublic,
        // Подаденото, не стойността от базата: иначе махната отметка за AI се
        // връща отметната при грешка и следващото „Запази“ я дава наново (чл. 7(3)).
        ai_discoverable: input.aiDiscoverable,
        theme: input.theme,
        accent: input.accent,
        avatar_shape: input.avatarShape,
        font: input.font,
        slug: input.slug,
      },
      // Връщаме ПОДАДЕНИТЕ от потребителя връзки — иначе редакцията по бутоните
      // тихо изчезваше и формата показваше старите стойности от базата.
      { error, links: input.parsed.links }
    );

  // Скрита от администратор (модерация) — собственикът не може да я върне сам,
  // иначе „скрий" щеше да е само предложение. Останалите промени се записват.
  if (profile.hidden_by_admin && input.isPublic) {
    input.isPublic = 0;
    saveProfileEdit(profile.id, input);
    return renderDashboard(req, res.status(400), getProfile(req.user.id), {
      error:
        'Визитката е скрита от администратор и не може да се публикува оттук. ' +
        'Останалите промени са записани. Пиши ни, ако смяташ, че е грешка.',
      links: input.parsed.links,
    });
  }

  saveProfileEdit(profile.id, input);

  // Уведоми търсачките (Bing и др.) за новата/променена публична визитка.
  if (input.isPublic) {
    const base = baseUrl(req);
    submitUrls(base, [`${base}/p/${input.slug}`]);
  }

  // Обнови картите в портфейлите на онези, които вече са я запазили (auto-update).
  const updated = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profile.id);
  notifyWalletUpdate(updated, baseUrl(req));

  res.redirect('/dashboard?saved=1');
});

// Обща логика за профилната и коричната снимка: проверка по съдържание, махане на
// метаданните, запис, изтриване на старата.
function saveOwnImage(req, res, column) {
  const profile = getProfile(req.user.id);
  if (!req.file) return renderDashboard(req, res.status(400), profile, { error: 'Избери файл.' });
  const image = prepareUpload(req.file.buffer);
  if (!image)
    return renderDashboard(req, res.status(400), profile, {
      error: 'Файлът не е разпознат като снимка. Приемаме JPG, PNG или WebP до 2 MB.',
    });
  const filename = `${crypto.randomBytes(16).toString('hex')}.${image.ext}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), image.buffer);
  deletePhotoFile(profile[column]);
  db.prepare(
    `UPDATE profiles SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(filename, req.user.id);
  res.redirect('/dashboard?saved=1');
}

router.post('/profile/photo', requireAuth, upload.single('photo'), csrfProtect, (req, res) =>
  saveOwnImage(req, res, 'photo')
);

router.post('/profile/photo/delete', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  deletePhotoFile(profile.photo);
  db.prepare("UPDATE profiles SET photo = '', updated_at = datetime('now') WHERE user_id = ?").run(
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

// Корична (заглавна) снимка — фон зад името на визитката.
router.post('/profile/cover', requireAuth, upload.single('cover'), csrfProtect, (req, res) =>
  saveOwnImage(req, res, 'cover')
);

router.post('/profile/cover/delete', requireAuth, csrfProtect, (req, res) => {
  const profile = getProfile(req.user.id);
  deletePhotoFile(profile.cover);
  db.prepare("UPDATE profiles SET cover = '', updated_at = datetime('now') WHERE user_id = ?").run(
    req.user.id
  );
  res.redirect('/dashboard?saved=1');
});

export default router;
