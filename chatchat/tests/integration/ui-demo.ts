/**
 * Ръчна проверка на UI-то (НЕ е тест, не се пуска от гейта): вдига приложението на фиксиран порт върху
 * тестовата база, засява фикстури и записва данните за вход в UI_DEMO_OUT. Спира с Ctrl+C.
 *   DATABASE_URL=…chatchat_test_ws UI_DEMO_OUT=/tmp/x.json npx tsx tests/integration/ui-demo.ts
 */
import { writeFileSync } from 'node:fs';
import { totpNow, PASSWORD, db, makeUser, startApp } from './helpers.js';
import { open, resetCollab, say } from './collab-world.js';
import { FakeScanner, SpyStore, URL_KEY } from './files.js';
import { ask, newCase, seedWorld } from './world.js';

const PORT = Number(process.env.UI_DEMO_PORT ?? 4391);
const ORIGIN = `http://127.0.0.1:${PORT}`;

await resetCollab();
const h = await startApp({
  diagnose: 'real',
  attachments: { store: new SpyStore(), scanner: new FakeScanner(), urlKey: URL_KEY },
  port: PORT,
  origin: ORIGIN,
});
const w = await seedWorld(h);

// Хора: нов служител без MFA (за настройка) и техник по желание
const newbie = await makeUser({
  tenantId: w.tenantA.id,
  role: 'SUPPORT',
  name: 'Nuovo Operatore',
  email: 'nuovo@example.test',
  mfa: false,
});
const engineering = await makeUser({
  tenantId: w.tenantA.id,
  role: 'ENGINEERING',
  name: 'Enzo Ingegnere',
  email: 'enzo@example.test',
});

// Бързи отговори
const qr = await w.ownerA1.post('/api/v1/quick-responses', {
  shortcut: 'seriale',
  locale: 'it',
  title: 'Chiedi il numero di serie',
  body: 'Buongiorno, può inviarmi il numero di serie del quadro (etichetta sul fianco)?',
  roleScope: ['SUPPORT', 'INTERNAL_TECHNICIAN', 'PORTAL_TECHNICIAN', 'ENGINEERING'],
});
await w.ownerA1.post(`/api/v1/quick-responses/${qr.body.quickResponse.id}/publish`);
const qr2 = await w.ownerA1.post('/api/v1/quick-responses', {
  shortcut: 'manuale',
  locale: 'it',
  title: 'Invia il manuale',
  body: 'In allegato il manuale aggiornato del quadro.',
  roleScope: ['SUPPORT', 'INTERNAL_TECHNICIAN', 'ENGINEERING'],
});
await w.ownerA1.post(`/api/v1/quick-responses/${qr2.body.quickResponse.id}/publish`);

// Разговори
const { signIn } = await import('./helpers.js');
const eng = await signIn(h, engineering);
const dm = await open(w.support, { type: 'DIRECT', userId: engineering.id });
await say(eng, dm, 'Ciao Sara, puoi guardare il caso della Alfa Srl? Sembra un E37 ricorrente.');
await say(w.support, dm, 'Certo, lo apro adesso.');
const generale = await open(w.support, {
  type: 'CHANNEL',
  name: 'Generale',
  userIds: [engineering.id],
});
await say(eng, generale, 'Nuovo firmware 5.1 disponibile per la famiglia LTX.');
const first = await say(w.support, generale, 'Grazie, lo testo domani sul banco.');
await say(eng, generale, 'Ricordate di aggiornare anche la revisione HW C.', {
  replyToId: first.id,
});
await w.support.post(`/api/v1/messages/${first.id}/reactions`, { reaction: 'done' });
await open(w.support, { type: 'CHANNEL', name: 'Urgenze', userIds: [engineering.id] });

// Случаи
const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
await ask(w.portalAlfa, caseId, 'Il display mostra E37 e la cabina non parte');
await w.support.post(`/api/v1/cases/${caseId}/assign`);
const caseId2 = await newCase(w.support);

// QR етикет
const qrLabel = await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr');
const token = new URL(qrLabel.body.url as string, ORIGIN).pathname.split('/').pop();

// Линк за нова парола
const target = await makeUser({
  tenantId: w.tenantA.id,
  role: 'INTERNAL_TECHNICIAN',
  name: 'Da Reimpostare',
  email: 'reset@example.test',
});
const reset = await w.tenantAdmin.post(`/api/v1/admin/users/${target.id}/reset-password`, {
  reason: 'prova interfaccia',
});

writeFileSync(
  process.env.UI_DEMO_OUT ?? '/tmp/ui-demo.json',
  JSON.stringify({
    origin: ORIGIN,
    password: PASSWORD,
    totp: 'run-time',
    users: {
      support: w.users.support.email,
      internal: w.users.internal.email,
      portal: w.users.portalAlfa.email,
      newbie: newbie.email,
      engineering: engineering.email,
      owner: w.users.ownerA1.email,
    },
    ids: {
      dm,
      generale,
      caseId,
      caseId2,
      support: w.users.support.id,
      engineering: engineering.id,
    },
    qrToken: token,
    resetUrl: reset.body.url,
  }),
);
console.log('READY', ORIGIN, totpNow());
void db;
await new Promise(() => undefined);
