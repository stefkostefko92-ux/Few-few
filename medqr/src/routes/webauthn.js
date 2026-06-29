import { asyncRouter } from '../async-router.js';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { requireAuth, createSession, sessionCookieOptions } from '../auth.js';
import { audit } from '../audit.js';
import {
  rp,
  saveChallenge,
  takeChallenge,
  listCredentials,
  getCredentialsForUser,
  findCredential,
  saveCredential,
  updateCounter,
  deleteCredential,
} from '../webauthn.js';

const router = asyncRouter();
const prod = process.env.NODE_ENV === 'production';
const challengeCookie = { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 1000 * 60 * 5 };

// ---------- Регистрация на passkey (изисква вход) ----------
router.post('/webauthn/register/options', requireAuth, async (req, res) => {
  const { rpName, rpID } = rp(req);
  const existing = getCredentialsForUser(req.user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: req.user.email,
    userID: Buffer.from(String(req.user.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: JSON.parse(c.transports || '[]'),
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const chalId = saveChallenge(req.user.id, options.challenge);
  res.cookie('wachal', chalId, challengeCookie);
  res.json(options);
});

router.post('/webauthn/register/verify', requireAuth, async (req, res) => {
  const chal = takeChallenge(req.cookies?.wachal);
  res.clearCookie('wachal');
  if (!chal || chal.user_id !== req.user.id) {
    return res.status(400).json({ error: res.locals.t('err.challenge_expired') });
  }
  const { origin, rpID } = rp(req);
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body.cred,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified)
      return res.status(400).json({ error: res.locals.t('err.webauthn_failed') });
    saveCredential(req.user.id, verification.registrationInfo.credential, req.body.label);
    audit(req, 'passkey_added');
    res.json({ ok: true });
  } catch (e) {
    console.error('webauthn register verify:', e.message);
    res.status(400).json({ error: res.locals.t('err.webauthn_failed') });
  }
});

// ---------- Вход с passkey (публично, discoverable) ----------
router.post('/webauthn/login/options', async (req, res) => {
  const { rpID } = rp(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  const chalId = saveChallenge(null, options.challenge);
  res.cookie('wachal', chalId, challengeCookie);
  res.json(options);
});

router.post('/webauthn/login/verify', async (req, res) => {
  const chal = takeChallenge(req.cookies?.wachal);
  res.clearCookie('wachal');
  if (!chal) return res.status(400).json({ error: res.locals.t('err.challenge_expired') });

  const cred = findCredential(req.body.cred?.id);
  if (!cred) return res.status(400).json({ error: res.locals.t('err.unknown_passkey') });

  const { origin, rpID } = rp(req);
  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body.cred,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: Buffer.from(cred.public_key, 'base64'),
        counter: cred.counter,
        transports: JSON.parse(cred.transports || '[]'),
      },
    });
    if (!verification.verified)
      return res.status(401).json({ error: res.locals.t('err.webauthn_failed') });
    updateCounter(cred.credential_id, verification.authenticationInfo.newCounter);
    const { token, maxAge } = createSession(cred.user_id, req, true); // паскей → остани вписан
    res.cookie('sid', token, sessionCookieOptions(maxAge));
    audit(req, 'login_success', { userId: cred.user_id, detail: 'passkey' });
    res.json({ ok: true, redirect: '/dashboard' });
  } catch (e) {
    console.error('webauthn login verify:', e.message);
    res.status(400).json({ error: res.locals.t('err.webauthn_failed') });
  }
});

// ---------- Управление на passkeys ----------
router.get('/profile/passkeys', requireAuth, (req, res) => {
  res.render('passkeys', { user: req.user, credentials: listCredentials(req.user.id) });
});

router.post('/profile/passkeys/:id/delete', requireAuth, (req, res) => {
  deleteCredential(req.user.id, Number(req.params.id));
  audit(req, 'passkey_removed');
  res.redirect('/profile/passkeys');
});

export default router;
