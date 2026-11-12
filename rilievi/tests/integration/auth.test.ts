import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
  makeAzienda,
  makeUser,
  prisma,
  signedIn,
  startApp,
  stopApp,
  PASSWORD,
} from './harness.js';

before(startApp);
after(stopApp);

describe('sign-in', () => {
  it('has no registration: only the sign-in form, and unknown pages are 404', async () => {
    const browser = new Browser();
    const page = await browser.get('/accesso');
    assert.equal(page.status, 200);
    assert.match(page.body, /Accesso riservato: solo su invito/);
    assert.doesNotMatch(page.body, /registr/i);
    for (const path of ['/registrazione', '/register', '/signup']) {
      assert.equal((await browser.get(path)).status, 404, path);
    }
  });

  it('sends anonymous visitors to the sign-in page and back where they wanted to go', async () => {
    const browser = new Browser();
    const reply = await browser.get('/schede?q=verdi');
    assert.equal(reply.status, 302);
    assert.equal(reply.location, '/accesso?next=%2Fschede%3Fq%3Dverdi');
  });

  it('signs in with an httpOnly JWT cookie checked against the session in the database', async () => {
    const user = await makeUser('TECNICO');
    const browser = new Browser();
    const reply = await browser.login(user.email);
    assert.equal(reply.status, 302);
    assert.equal(reply.location, '/schede');
    const setCookie = reply.headers.getSetCookie().find((line) => line.startsWith('rilievi_sid='));
    assert.ok(setCookie, 'session cookie set');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const jwt = browser.cookies.get('rilievi_sid')!;
    assert.equal(jwt.split('.').length, 3, 'a JWT');
    assert.equal((await browser.get('/schede')).status, 200);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await makeUser('TECNICO');
    const wrong = await new Browser().login(user.email, 'Not-The-Right-One-99');
    const unknown = await new Browser().login('nobody@rilievi.test', 'Not-The-Right-One-99');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    const message = (body: string) => /<div class="errors"[^>]*><h2>([^<]+)</.exec(body)?.[1];
    assert.equal(message(wrong.body), message(unknown.body));
  });

  it('locks after 5 wrong passwords — known and unknown emails alike — even for the right password', async () => {
    const user = await makeUser('TECNICO');
    const browser = new Browser();
    let last = await browser.login(user.email, 'Wrong-Password-000');
    for (let i = 0; i < 4; i += 1) last = await browser.login(user.email, 'Wrong-Password-000');
    assert.equal(last.status, 429);
    assert.equal((await browser.login(user.email, PASSWORD)).status, 429);
    const ghost = new Browser();
    for (let i = 0; i < 4; i += 1) await ghost.login('ghost@rilievi.test', 'Wrong-Password-000');
    assert.equal((await ghost.login('ghost@rilievi.test', 'Wrong-Password-000')).status, 429);
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'LOGIN_LOCKED', targetId: user.id } }),
      1,
    );
  });

  it('treats a forged or tampered cookie as signed out', async () => {
    const { browser } = await signedIn('TECNICO');
    const jwt = browser.cookies.get('rilievi_sid')!;
    const [head, payload, signature] = jwt.split('.');
    const forged = new Browser();
    forged.cookies.set('rilievi_sid', `${head}.${payload}.${signature!.slice(0, -2)}xx`);
    assert.equal((await forged.get('/schede')).status, 302);
    const none = new Browser();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    none.cookies.set('rilievi_sid', `${header}.${payload}.`);
    assert.equal((await none.get('/schede')).status, 302);
  });

  it('logs out for real: the old cookie stops working', async () => {
    const { browser } = await signedIn('TECNICO');
    const jwt = browser.cookies.get('rilievi_sid')!;
    const out = await browser.submit('/account', '/esci', {});
    assert.equal(out.status, 302);
    const replay = new Browser();
    replay.cookies.set('rilievi_sid', jwt);
    assert.equal((await replay.get('/schede')).status, 302);
  });

  it('refuses forms without the CSRF token or from another origin', async () => {
    const { browser } = await signedIn('TECNICO');
    assert.equal((await browser.post('/esci', {})).status, 403);
    const _csrf = await browser.csrf('/account');
    const foreign = await browser.post('/esci', { _csrf }, { origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
    const signIn = await new Browser().post('/accesso', { email: 'a@b.it', password: 'x' });
    assert.equal(signIn.status, 403);
  });

  it('cuts a deactivated account off at its next request', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const { browser: manager } = await signedIn('ADMIN');
    const reply = await manager.submit(`/utenti/${user.id}`, `/utenti/${user.id}/stato`, {
      active: '0',
    });
    assert.equal(reply.status, 302);
    assert.equal((await browser.get('/schede')).status, 302);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    const again = await new Browser().login(user.email);
    assert.equal(again.status, 403);
  });

  it('cuts off every person of a deactivated company, and lets them back when it returns', async () => {
    const azienda = await makeAzienda('Azienda Sospesa');
    const { user, browser } = await signedIn('TECNICO', azienda.id);
    const { browser: master } = await signedIn('MASTER');
    const off = await master.submit(`/aziende/${azienda.id}`, `/aziende/${azienda.id}/stato`, {
      active: '0',
    });
    assert.equal(off.status, 303);
    assert.equal((await browser.get('/schede')).status, 302, 'the open session ends');
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal((await new Browser().login(user.email)).status, 403);
    await master.submit(`/aziende/${azienda.id}`, `/aziende/${azienda.id}/stato`, { active: '1' });
    assert.equal((await new Browser().login(user.email)).status, 302);
  });

  it('forces the first MASTER to change a temporary password before anything else', async () => {
    const master = await makeUser('MASTER');
    await prisma.user.update({ where: { id: master.id }, data: { mustChangePassword: true } });
    const browser = new Browser();
    const reply = await browser.login(master.email);
    assert.equal(reply.location, '/account');
    assert.equal((await browser.get('/schede')).location, '/account');
    const changed = await browser.submit('/account', '/account/password', {
      current: PASSWORD,
      password: 'Nuova-Password-Lunga-2026',
      confirm: 'Nuova-Password-Lunga-2026',
    });
    assert.equal(changed.status, 302);
    assert.equal((await browser.get('/schede')).status, 200);
  });

  it('sets the security headers on every page', async () => {
    const reply = await new Browser().get('/accesso');
    const csp = reply.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(reply.headers.get('x-frame-options'), 'DENY');
    assert.equal(reply.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    assert.match(reply.body, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(
      reply.body,
      /Created and Designed by <a href="https:\/\/carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC<\/a>/,
    );
    // Only the public pages are crawled; the portal itself stays out (site.test.ts has the details).
    const robots = await new Browser().get('/robots.txt');
    assert.match(robots.body, /\nDisallow: \/\n/);
    assert.doesNotMatch(robots.body, /Allow: \/schede/);
    const health = await new Browser().get('/health');
    assert.deepEqual(JSON.parse(health.body), { status: 'ok', app: 'rilievi' });
  });
});
