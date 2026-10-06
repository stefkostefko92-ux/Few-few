import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeUserAgent,
  deviceSummary,
  fingerprintHash,
  hwidLabel,
  mailDeviceSummary,
  parseFingerprint,
} from '../src/auth/device.js';

const FP = {
  platform: 'Win32',
  cores: 8,
  memory: 8,
  screen: '1920x1080',
  depth: 24,
  ratio: 1,
  touch: 0,
  tz: 'Europe/Sofia',
  langs: 'bg-BG,en',
  gpuVendor: 'Google Inc. (Intel)',
  gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620)',
};

test('the fingerprint is parsed strictly', () => {
  assert.deepEqual(parseFingerprint(JSON.stringify(FP)), FP);
  assert.equal(parseFingerprint(JSON.stringify({ ...FP, extra: 'x' })), null);
  assert.equal(parseFingerprint(JSON.stringify({ ...FP, screen: '1920 x 1080' })), null);
  assert.equal(parseFingerprint(JSON.stringify({ ...FP, cores: 1e9 })), null);
  assert.equal(parseFingerprint('not json'), null);
  assert.equal(parseFingerprint('x'.repeat(3000)), null);
  assert.equal(parseFingerprint(42), null);
  // free text cannot carry new lines or bidi overrides into the panel or a mail
  assert.equal(
    parseFingerprint(JSON.stringify({ ...FP, gpu: 'ANGLE\n\nRendetto team: ok' })),
    null,
  );
  assert.equal(parseFingerprint(JSON.stringify({ ...FP, tz: 'Europe/\u202eSofia' })), null);
});

test('HWID follows the hardware, not the language, time zone or screen', () => {
  const a = fingerprintHash(FP);
  assert.ok(a && /^[0-9a-f]{64}$/.test(a));
  assert.equal(fingerprintHash({ ...FP, tz: 'Europe/Rome', langs: 'it', screen: '1280x720' }), a);
  assert.notEqual(fingerprintHash({ ...FP, gpu: 'ANGLE (NVIDIA)' }), a);
  assert.equal(fingerprintHash({ tz: 'Europe/Sofia' }), null);
  assert.match(hwidLabel(a), /^HW-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(hwidLabel(null), '');
});

test('browser and system are named from the user agent', () => {
  const edge =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
  assert.deepEqual(describeUserAgent(edge), { browser: 'Edge 141', os: 'Windows' });
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(describeUserAgent(safari).os, 'iOS');
  assert.equal(describeUserAgent(safari).browser, 'Safari 18');
  assert.match(deviceSummary(FP, edge), /Windows/);
  // the security mail names only what was recognised from the user agent, never the client's free text
  assert.equal(mailDeviceSummary(edge), 'Windows, Edge 141');
  assert.equal(mailDeviceSummary('Totally legit https://evil.example'), '—');
});
