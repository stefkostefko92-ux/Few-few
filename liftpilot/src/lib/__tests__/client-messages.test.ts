// The public pages send the browser only some namespaces of messages (src/i18n/client-messages.ts): every client
// component a public page renders must read only those, or its texts would be missing. The application's pages get all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import it from '../../../messages/it.json';
import { PUBLIC_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
/** The client components of the public pages (the header's language switch and drawer, the landing's tabs, the forms around the sign-in, the error page). */
const PUBLIC_CLIENT = [
  'src/components/LangSwitch.tsx', 'src/components/LoginForm.tsx', 'src/components/RegisterForm.tsx', 'src/components/ForgotPasswordForm.tsx',
  'src/components/ResetPasswordForm.tsx', 'src/components/VerifyEmailForm.tsx', 'src/components/InviteAcceptForm.tsx', 'src/app/[locale]/error.tsx',
  'src/components/MobileNav.tsx', 'src/components/landing/ShowcaseTabs.tsx',
];

test('client messages: the public client components read only the namespaces the public pages send', () => {
  for (const file of PUBLIC_CLIENT) {
    const src = readFileSync(path.join(root, file), 'utf8');
    assert.ok(src.startsWith("'use client'"), `${file} is a client component`);
    assert.doesNotMatch(src, /useMessages\(\)|useTranslations\(\)/, `${file} reads every message`);
    for (const [, ns] of src.matchAll(/useTranslations\('([^']+)'\)/g)) {
      assert.ok((PUBLIC_CLIENT_NAMESPACES as readonly string[]).includes(ns ?? ''), `${file} reads «${ns}»`);
    }
  }
});

test('client messages: the picked namespaces exist and nothing else is sent', () => {
  const picked = pickMessages(it, PUBLIC_CLIENT_NAMESPACES);
  assert.deepEqual(Object.keys(picked).sort(), [...PUBLIC_CLIENT_NAMESPACES].sort());
  assert.ok(JSON.stringify(picked).length < JSON.stringify(it).length / 3);
});
