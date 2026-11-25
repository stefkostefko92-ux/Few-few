import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAlertEmail, adminEmails, notifyAdmins } from '../admin-alert';

test('adminEmails: чете ADMIN_EMAILS, маха празни и невалидни', () => {
  assert.deepEqual(adminEmails(' A@x.eu, ,bad, b@y.org '), ['a@x.eu', 'b@y.org']);
  assert.deepEqual(adminEmails(''), []);
});

test('adminAlertEmail: тема с префикс, редовете са екранирани', () => {
  const { subject, html } = adminAlertEmail({
    subject: 'Платена, неприложена поръчка',
    lines: ['Поръчка: ord_1', '<script>x</script>'],
    adminUrl: 'https://l.example/bg/admin',
  });
  assert.equal(subject, '[Linketto] Платена, неприложена поръчка');
  assert.ok(html.includes('ord_1'));
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('https://l.example/bg/admin'));
});

test('notifyAdmins: казва дали писмо е тръгнало — без ADMIN_EMAILS или без поща → false (спорът чака cron-а)', async () => {
  const saved = { admins: process.env.ADMIN_EMAILS, key: process.env.BREVO_API_KEY };
  try {
    process.env.ADMIN_EMAILS = '';
    process.env.BREVO_API_KEY = 'x';
    assert.equal(await notifyAdmins('t', ['l']), false);
    process.env.ADMIN_EMAILS = 'a@x.eu';
    delete process.env.BREVO_API_KEY;
    assert.equal(await notifyAdmins('t', ['l']), false);
  } finally {
    if (saved.admins === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = saved.admins;
    if (saved.key === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = saved.key;
  }
});

test('admin.errorRefundPending: отделен текст за заседнал refund („в ход — натисни пак“) на bg, en, it', async () => {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  for (const locale of ['bg', 'en', 'it']) {
    const messages = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'messages', `${locale}.json`), 'utf8'));
    const text = messages.admin?.errorRefundPending;
    assert.equal(typeof text, 'string', locale);
    assert.notEqual(text, messages.admin.errorRefund, locale);
  }
});
