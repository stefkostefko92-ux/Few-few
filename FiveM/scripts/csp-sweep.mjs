/**
 * Обход за CSP нарушения срещу ЖИВ инстанс — в истински Chromium.
 *
 *   node scripts/csp-sweep.mjs                        # 127.0.0.1:3010
 *   PROBE_BASE_URL=http://127.0.0.1:3100 node scripts/csp-sweep.mjs
 *
 * ЗАЩО. Content-Security-Policy е хедър, който не се вижда в `npm test`,
 * не се вижда в `next build` и не се вижда в `smoke.mjs` (той чете HTML, не
 * изпълнява страницата). Политика, която блокира собствен ресурс, изглежда
 * точно като работеща политика — докато не отвориш страницата в браузър и
 * не видиш конзолата. Тоест единственият честен тест е браузър, който
 * зарежда ВСЯКА страница и слуша за `securitypolicyviolation` и за
 * „Refused to …“ в конзолата.
 *
 * Иска `playwright-core` (браузърът е в /opt/pw-browsers). Без него излиза с
 * код 2 = НЕИЗМЕРЕНО, не с „чисто“ — нарочно, същото правило като authz-probe.
 *
 * Изходен код: 0 = нула нарушения, 1 = има, 2 = неизмерено.
 */
import { existsSync, readdirSync } from 'node:fs';

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3010';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('✗ няма playwright-core (npm i -D playwright-core) — CSP обходът е НЕИЗМЕРЕН');
  process.exit(2);
}

let exe = process.env.CHROMIUM_PATH ?? null;
if (!exe && existsSync('/opt/pw-browsers')) {
  for (const dir of readdirSync('/opt/pw-browsers')) {
    const candidate = `/opt/pw-browsers/${dir}/chrome-linux/chrome`;
    if (existsSync(candidate)) {
      exe = candidate;
      break;
    }
  }
}
if (!exe) {
  console.error('✗ няма Chromium (CHROMIUM_PATH или /opt/pw-browsers) — НЕИЗМЕРЕНО');
  process.exit(2);
}

try {
  await fetch(`${BASE}/api/health`);
} catch (error) {
  console.error(`✗ ${BASE} не отговаря: ${error instanceof Error ? error.message : error} — НЕИЗМЕРЕНО`);
  process.exit(2);
}

// Същият списък като smoke.mjs — всяка публична страница на двата езика,
// плюс входа на панела (той е единствената страница с форма без сесия).
const PATHS = [
  '',
  '/servers',
  '/rules',
  '/tutorials',
  '/streamers',
  '/news',
  '/submit',
  '/report',
  '/faq',
  '/team',
  '/contact',
  '/support',
  '/impresum',
  '/privacy',
  '/terms',
  '/servers/whitelist',
  '/servers/framework/esx',
  '/servers/framework/qbcore',
  '/admin/login',
];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const violations = [];
page.on('console', (message) => {
  const text = message.text();
  if (/Content Security Policy|Refused to/i.test(text)) violations.push({ url: page.url(), text });
});
// Събитието е по-надеждно от конзолата: идва с директивата и блокирания URI.
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (event) => {
    console.log(
      `Content Security Policy violation: ${event.violatedDirective} blocked ${event.blockedURI || '(inline)'} at ${event.sourceFile || '?'}:${event.lineNumber || '?'}`,
    );
  });
});

let pages = 0;
let cspSeen = false;
for (const locale of ['bg', 'en']) {
  for (const path of PATHS) {
    const response = await page.goto(`${BASE}/${locale}${path}`, { waitUntil: 'networkidle' });
    if (response?.headers()['content-security-policy']) cspSeen = true;
    pages += 1;
  }
}
await browser.close();

if (!cspSeen) {
  console.error('✗ нито един отговор не носи Content-Security-Policy — сървърът в production режим ли е? НЕИЗМЕРЕНО');
  process.exit(2);
}

for (const violation of violations) console.log(`✗ ${violation.url}\n    ${violation.text}`);
console.log(
  violations.length === 0
    ? `✓ ${pages} страници в Chromium: нула CSP нарушения`
    : `\nРЕЗУЛТАТ: ${violations.length} нарушения на ${pages} страници.`,
);
process.exit(violations.length === 0 ? 0 : 1);
