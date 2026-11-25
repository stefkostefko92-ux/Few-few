// An upload cut off halfway (the phone loses the signal in the shaft, the page is left while it sends):
// multer removes the part already written and drops `file.path`; the clean-up when the response closes
// must not then try to remove "undefined" — that rejected outside any catch and took the whole portal
// down for everyone (30 October 2026). The portal keeps answering and nothing stays in arrivi/.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { BASE, PORT, prisma, signedIn, startApp, stopApp } from './harness.js';
import { arriviEmpty } from './media.js';

before(startApp);
after(stopApp);

/** Sends the start of a multipart upload — the CSRF token, the section, half a photo — then hangs up. */
function uploadCutOff(path: string, headers: Record<string, string>, csrf: string): Promise<void> {
  const boundary = '----rilievi-interrotto';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrf}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="sezione"\r\n\r\nimpianto\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.jpg"\r\n` +
      'Content-Type: image/jpeg\r\n\r\n',
  );
  const half = Buffer.alloc(256 * 1024, 0xab);
  half.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return new Promise((resolve) => {
    const req = request({
      host: '127.0.0.1',
      port: PORT,
      method: 'POST',
      path,
      headers: {
        ...headers,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        // The whole photo would be 4 MB: the body never gets there.
        'content-length': String(head.length + 4 * 1024 * 1024),
      },
    });
    req.on('error', () => resolve());
    req.write(head);
    req.write(half, () =>
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 150),
    );
  });
}

describe('an upload cut off halfway', () => {
  it('leaves the portal up and nothing in arrivi/', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const scheda = await prisma.scheda.create({
      data: { aziendaId: user.aziendaId!, data: new Date('2026-10-12'), searchText: '' },
    });
    const csrf = await browser.csrf(`/schede/${scheda.id}`);
    const cookie = [...browser.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    for (let i = 0; i < 3; i += 1)
      await uploadCutOff(
        `/schede/${scheda.id}/allegati`,
        { cookie, origin: BASE, 'x-forwarded-for': browser.ip },
        csrf,
      );
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await fetch(`${BASE}/health`)).status, 200, 'the portal still answers');
    await arriviEmpty();
    assert.equal(await prisma.allegato.count({ where: { schedaId: scheda.id } }), 0);
  });
});
