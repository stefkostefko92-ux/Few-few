import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ROOT } from '../src/paths.js';

const SOURCE = readFileSync(join(ROOT, 'public/js/auth.js'), 'utf8');

/**
 * Runs public/js/auth.js against one form and submits it. `consent` is the sign-up form's box
 * (ticked or not); null is the sign-in form, which has no box and carries data-fingerprint only
 * when the server allows it. Returns the hidden field and how often the script asked for a WebGL
 * context.
 */
function submit(consent: boolean | null): { fp: string; webgl: number } {
  let webgl = 0;
  let onSubmit: (() => void) | undefined;
  const field = { value: '' };
  const box = consent === null ? null : { checked: consent };
  const form = {
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'submit') onSubmit = listener;
    },
    querySelector: (selector: string) =>
      selector === 'input[name="fp"]'
        ? field
        : selector === 'input[name="deviceConsent"]'
          ? box
          : null,
  };
  runInNewContext(SOURCE, {
    document: {
      querySelectorAll: () => [form],
      createElement: () => ({
        getContext: () => {
          webgl += 1;
          return null;
        },
      }),
    },
    navigator: { platform: 'Win32', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0 },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
  });
  assert.ok(onSubmit, 'the script listens for the submit');
  onSubmit();
  return { fp: field.value, webgl };
}

test('the sign-up form reads nothing from the device while the consent box is not ticked', () => {
  assert.deepEqual(submit(false), { fp: '', webgl: 0 });
});

test('with the box ticked, and on a sign-in form the server let read it, the fingerprint is read', () => {
  for (const consent of [true, null]) {
    const { fp, webgl } = submit(consent);
    assert.ok(webgl > 0, `consent ${consent}: the graphics card is asked`);
    assert.deepEqual(JSON.parse(fp), {
      platform: 'Win32',
      cores: 8,
      memory: 8,
      screen: '1920x1080',
      depth: 24,
      touch: 0,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }
});
