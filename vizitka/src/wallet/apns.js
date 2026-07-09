// APNs пуш за Apple Wallet auto-update. При промяна на визитката пращаме „тих"
// сигнал до всяко регистрирано устройство; то после дърпа обновения .pkpass през
// нашия web service. Token-based APNs (ES256 JWT с .p8 ключ) през вградения http2 —
// без външни зависимости. Активира се само при конфигуриран APPLE_APNS_KEY.
import http2 from 'node:http2';
import crypto from 'node:crypto';
import fs from 'node:fs';
import db from '../db.js';
import { appleApnsEnabled } from './shared.js';

const APNS_HOST = process.env.APPLE_APNS_HOST || 'https://api.push.apple.com';

// Кеширан провайдър токен (валиден до час; подновяваме на ~50 мин).
let cachedToken = null;
let cachedAt = 0;

function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedAt < 3000) return cachedToken;
  const keyId = process.env.APPLE_APNS_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const key = fs.readFileSync(process.env.APPLE_APNS_KEY, 'utf8');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const sig = crypto
    .sign('SHA256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  cachedToken = `${header}.${payload}.${sig}`;
  cachedAt = now;
  return cachedToken;
}

const b64url = (s) => Buffer.from(s).toString('base64url');

// Пуска обновяване към всички устройства, регистрирали дадената визитка
// (serial = profile.id — стабилен, не slug).
export async function pushPassUpdate(serial) {
  if (!appleApnsEnabled()) return;
  const rows = db
    .prepare('SELECT push_token FROM apple_pass_registrations WHERE serial_number = ?')
    .all(serial);
  if (!rows.length) return;

  const topic = process.env.APPLE_PASS_TYPE_ID;
  const token = providerToken();
  const client = http2.connect(APNS_HOST);
  client.on('error', () => {}); // мрежови грешки не бива да чупят запазването на профила

  await Promise.all(
    rows.map(
      (r) =>
        new Promise((resolve) => {
          const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${r.push_token}`,
            authorization: `bearer ${token}`,
            'apns-topic': topic,
            'apns-push-type': process.env.APPLE_APNS_PUSH_TYPE || 'background',
            'apns-priority': '5',
          });
          req.setEncoding('utf8');
          req.setTimeout(5000, () => req.close()); // не увисвай, ако APNs не отговори
          req.on('response', () => {});
          req.on('error', () => resolve());
          req.on('close', () => resolve());
          req.on('end', () => resolve());
          req.end('{}');
        })
    )
  ).finally(() => client.close());
}
