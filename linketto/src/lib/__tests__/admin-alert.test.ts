import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAlertEmail, adminEmails } from '../admin-alert';

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
