import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_BODY_BYTES, readCapped, resolvePublicIpv4 } from '../fivem-query';

/**
 * Регресия за DNS rebinding (TOCTOU): `fetch(host)` резолвира ВТОРИ път при
 * connect, затова guard-ът трябва да ВЪРНЕ проверения IP, а викащият да пингва
 * него. Договорът `Promise<string>` е самата защита — върне ли се пак `void`,
 * дупката се отваря тихо.
 */
test('guard-ът връща проверения IP, а не просто одобрение', async () => {
  const ip = await resolvePublicIpv4('8.8.8.8');
  assert.equal(ip, '8.8.8.8');
});

test('частните адреси се отказват (SSRF)', async () => {
  for (const host of ['127.0.0.1', '169.254.169.254', '10.1.2.3', '192.168.0.1']) {
    await assert.rejects(() => resolvePublicIpv4(host), `${host} трябва да бъде отказан`);
  }
});

test('водещи нули не заобикалят филтъра', async () => {
  // „0177.0.0.1“ не е валиден IPv4 за нас → минава по пътя на хостнейма и
  // резолюцията пропада; важното е, че НЕ се приема като публичен адрес.
  await assert.rejects(() => resolvePublicIpv4('0177.0.0.1'));
});

function responseOfSize(bytes: number): Response {
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.byteLength, bytes - sent);
      controller.enqueue(chunk.subarray(0, size));
      sent += size;
    },
  });
  return new Response(stream);
}

/**
 * Регресия за тавана на тялото: `(await res.text()).slice(0, CAP)` буферира
 * ЦЯЛОТО тяло, преди да реже — измерено 40 MB при обявен таван 512 KB.
 * Четенето трябва да прекъсва в мига на надхвърлянето.
 */
test('тяло над тавана се отхвърля, не се буферира', async () => {
  const result = await readCapped(responseOfSize(MAX_BODY_BYTES + 64 * 1024));
  assert.equal(result, null);
});

test('тяло под тавана се чете нормално', async () => {
  const result = await readCapped(new Response('{"clients":3}'));
  assert.equal(result, '{"clients":3}');
});
