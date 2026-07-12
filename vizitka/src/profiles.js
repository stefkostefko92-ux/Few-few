// Обща логика за редакция на профил — ползва се и от таблото (собственикът), и от
// админ панела (администраторите редактират чужди визитки). Държи валидацията на
// едно място, за да не се разминава между двата пътя.
import db from './db.js';
import { isValidSlug } from './slug.js';
import { normalizeTheme } from './themes.js';
import { normalizeShape, normalizeFont, normalizeAccent } from './personalize.js';
import { replaceLinks, parseLinkFields } from './links.js';

// [име на поле, макс. дължина] — текстовите полета на визитката.
export const TEXT_FIELDS = [
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

// Събира и нормализира входа от формата (без да пипа базата).
export function collectProfileInput(body) {
  const fields = {};
  for (const [name, max] of TEXT_FIELDS)
    fields[name] = String(body[name] || '')
      .trim()
      .slice(0, max);
  return {
    fields,
    type: body.type === 'company' ? 'company' : 'personal',
    isPublic: body.is_public === '1' ? 1 : 0,
    theme: normalizeTheme(body.theme),
    accent: normalizeAccent(body.accent),
    avatarShape: normalizeShape(body.avatar_shape),
    font: normalizeFont(body.font),
    slug: String(body.slug || '')
      .trim()
      .toLowerCase(),
    parsed: parseLinkFields(body),
  };
}

// Валидира входа. Връща съобщение за грешка или null. `excludeProfileId` изключва
// текущата визитка от проверката за зает слъг.
export function validateProfileInput(input, excludeProfileId) {
  const { fields, slug, parsed } = input;
  if (fields.display_name.length < 2) return 'Името е задължително (поне 2 знака).';
  if (!isValidSlug(slug))
    return 'Невалиден адрес: 3–40 знака, само малки латински букви, цифри и тире.';
  const clash = db
    .prepare('SELECT 1 FROM profiles WHERE slug = ? AND id != ?')
    .get(slug, excludeProfileId);
  if (clash) return 'Този адрес вече е зает. Избери друг.';
  for (const url of [fields.website, fields.facebook, fields.instagram, fields.linkedin]) {
    if (url && !/^https?:\/\//i.test(url))
      return 'Линковете трябва да започват с http:// или https://.';
  }
  if (parsed.error) return parsed.error;
  return null;
}

// Записва промените по профил (по id) + собствените връзки. Приема вход от
// collectProfileInput (вече валидиран).
export function saveProfileEdit(profileId, input) {
  const { fields, type, isPublic, theme, accent, avatarShape, font, slug, parsed } = input;
  db.prepare(
    `UPDATE profiles SET
       slug = @slug, type = @type, display_name = @display_name, headline = @headline,
       company = @company, phone = @phone, contact_email = @contact_email, website = @website,
       address = @address, bio = @bio, facebook = @facebook, instagram = @instagram,
       linkedin = @linkedin, is_public = @is_public, theme = @theme, accent = @accent,
       avatar_shape = @avatar_shape, font = @font, updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    ...fields,
    slug,
    type,
    is_public: isPublic,
    theme,
    accent,
    avatar_shape: avatarShape,
    font,
    id: profileId,
  });
  replaceLinks(profileId, parsed.links);
}
