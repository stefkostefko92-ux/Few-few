// Apple Wallet .pkpass — генериране и подписване на „generic" визитна карта.
// Картата носи QR баркод към живия профил (винаги актуален) + основните контакти.
// Подписът е detached PKCS#7 през системния openssl (наличен на сървъра); ключовете
// живеят като файлове с права 600, извън репото. Активира се само с валидни сертификати.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { getLinks } from '../links.js';
import { zipStore, solidPng, sha1 } from './binary.js';
import { cardBgHex, rgbCss, hexToRgb, passAuthToken, appleApnsEnabled } from './shared.js';
import { UPLOADS_DIR } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

const field = (key, label, value) => (value ? [{ key, label, value: String(value) }] : []);

// Структурата на pass.json (изнесена за тестове — без подпис/файлове).
export function buildPassJson(profile, base) {
  const bg = cardBgHex(profile);
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_TEAM_ID;
  const cardUrl = `${base}/p/${profile.slug}`;

  const backFields = [
    ...field('web', 'Уебсайт', profile.website),
    ...field('address', 'Адрес', profile.address),
    ...field('bio', 'За мен', profile.bio),
    { key: 'profile', label: 'Онлайн визитка', value: cardUrl },
    ...field('facebook', 'Facebook', profile.facebook),
    ...field('instagram', 'Instagram', profile.instagram),
    ...field('linkedin', 'LinkedIn', profile.linkedin),
    ...getLinks(profile.id).map((l, i) => ({ key: `link${i}`, label: l.label, value: l.url })),
  ];

  const pass = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    organizationName: 'Vizitka',
    serialNumber: String(profile.id), // стабилен — не се чупи при смяна на слъг
    description: `Визитка на ${profile.display_name}`,
    logoText: profile.company || 'Vizitka',
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgba(255, 255, 255, 0.75)',
    backgroundColor: rgbCss(bg),
    sharingProhibited: false,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: cardUrl,
        messageEncoding: 'iso-8859-1',
        altText: profile.slug,
      },
    ],
    generic: {
      primaryFields: [{ key: 'name', label: '', value: profile.display_name }],
      secondaryFields: [
        ...field('title', 'Позиция', profile.headline),
        ...field('company', 'Фирма', profile.company),
      ],
      auxiliaryFields: [
        ...field('phone', 'Телефон', profile.phone),
        ...field('email', 'Имейл', profile.contact_email),
      ],
      backFields,
    },
  };

  // Auto-update: закачаме web service само когато APNs е конфигуриран.
  if (appleApnsEnabled()) {
    pass.webServiceURL = base;
    pass.authenticationToken = passAuthToken(profile.id);
  }
  return pass;
}

// Изображенията на паса. logo/icon от бранда; ако липсва — плътна икона по цвета.
function passImages(profile) {
  const files = [];
  const logoPath = join(PUBLIC_DIR, 'logo.png');
  const logo = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;
  const icon = solidPng(87, hexToRgb(cardBgHex(profile)));

  files.push({ name: 'icon.png', data: icon });
  files.push({ name: 'icon@2x.png', data: icon });
  if (logo) {
    files.push({ name: 'logo.png', data: logo });
    files.push({ name: 'logo@2x.png', data: logo });
  }
  // Снимка на потребителя като thumbnail — само PNG (pkpass приема само PNG).
  if (profile.photo && profile.photo.endsWith('.png')) {
    const p = join(UPLOADS_DIR, profile.photo);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      files.push({ name: 'thumbnail.png', data: buf });
      files.push({ name: 'thumbnail@2x.png', data: buf });
    }
  }
  return files;
}

// Detached PKCS#7 подпис на manifest.json през openssl.
function signManifest(manifestBuf) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'pkpass-'));
  try {
    const mf = join(dir, 'manifest.json');
    const sig = join(dir, 'signature');
    fs.writeFileSync(mf, manifestBuf);
    const args = [
      'smime',
      '-sign',
      '-binary',
      '-noattr',
      '-outform',
      'DER',
      '-in',
      mf,
      '-out',
      sig,
      '-signer',
      process.env.APPLE_PASS_CERT,
      '-inkey',
      process.env.APPLE_PASS_KEY,
      '-certfile',
      process.env.APPLE_WWDR_CERT,
    ];
    if (process.env.APPLE_PASS_KEY_PASSPHRASE)
      args.push('-passin', `pass:${process.env.APPLE_PASS_KEY_PASSPHRASE}`);
    execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    return fs.readFileSync(sig);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Готовият подписан .pkpass като Buffer.
export function buildPkpass(profile, base) {
  const passJson = Buffer.from(JSON.stringify(buildPassJson(profile, base)));
  const files = [{ name: 'pass.json', data: passJson }, ...passImages(profile)];

  const manifest = {};
  for (const f of files) manifest[f.name] = sha1(f.data);
  const manifestBuf = Buffer.from(JSON.stringify(manifest));

  const signature = signManifest(manifestBuf);

  return zipStore([
    ...files,
    { name: 'manifest.json', data: manifestBuf },
    { name: 'signature', data: signature },
  ]);
}

// Кеширан вариант — ключ по (id, updated_at, base). Подписването е скъпо (openssl
// spawn); кешът пази event loop-а при повтарящи се сваляния на непроменена визитка и
// сам се невалидира при редакция (updated_at се сменя). Ограничен размер срещу растеж.
const PKPASS_CACHE = new Map();
const PKPASS_CACHE_MAX = 500;

export function getPkpass(profile, base) {
  const key = `${profile.id}:${profile.updated_at}:${base}`;
  const hit = PKPASS_CACHE.get(key);
  if (hit) return hit;
  const buf = buildPkpass(profile, base);
  if (PKPASS_CACHE.size >= PKPASS_CACHE_MAX) PKPASS_CACHE.delete(PKPASS_CACHE.keys().next().value);
  PKPASS_CACHE.set(key, buf);
  return buf;
}
