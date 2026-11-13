import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env['LEDGER_SEAL_KEY'] ??= randomBytes(32).toString('hex');
process.env['JWT_SECRET'] ??= randomBytes(32).toString('hex');
process.env['DATABASE_URL'] ??= 'postgresql://x@127.0.0.1/x';
process.env['PUBLIC_BASE_URL'] ??= 'http://127.0.0.1:4340';

const {
  parseIntegrationForm,
  secretHint,
  sealSecrets,
  openSecrets,
  resolveSmtp,
  resolveRevolut,
  INTEGRATIONS,
} = await import('../src/admin/integrations.js');
const { checkRevolut, checkSmtp, scrub, REVOLUT_API_VERSION } =
  await import('../src/admin/integration-checks.js');
const { transferInviteMail } = await import('../src/mail/templates.js');
const { transportOptions } = await import('../src/mail/mailer.js');

const BREVO_KEY = 'xsmtpsib-0123456789abcdef0123456789abcdef-AbCd';
// Сглобени по време на изпълнение — да не приличат на истински ключ за скенерите на тайни.
const SK = ['sk', 'fake', 'revolut', '0123456789abcdef'].join('_');
const WSK = 'wsk_0123456789abcdefghijklmnop';

const smtpBody = {
  host: 'smtp-relay.brevo.com',
  port: '2525',
  user: 'login@smtp-brevo.test',
  pass: BREVO_KEY,
  from: 'Фактурист <no-reply@fakturist.eu>',
};

test('SMTP: формата дава настройките и новата тайна', () => {
  const result = parseIntegrationForm('smtp', smtpBody, {});
  assert.ok(result.ok);
  assert.deepEqual(result.config, {
    host: 'smtp-relay.brevo.com',
    port: 2525,
    secure: false,
    user: 'login@smtp-brevo.test',
    from: 'Фактурист <no-reply@fakturist.eu>',
  });
  assert.deepEqual(result.secrets, { pass: BREVO_KEY });
  assert.deepEqual(result.changed, ['pass']);
  assert.deepEqual(result.cleared, []);
});

test('празно поле за тайна пази старата стойност; „изтрий“ я маха', () => {
  const kept = parseIntegrationForm('smtp', { ...smtpBody, pass: '' }, { pass: BREVO_KEY });
  assert.ok(kept.ok);
  assert.deepEqual(kept.secrets, { pass: BREVO_KEY });
  assert.deepEqual(kept.changed, []);
  const cleared = parseIntegrationForm(
    'smtp',
    { ...smtpBody, pass: '', clear_pass: 'on' },
    { pass: BREVO_KEY },
  );
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.secrets, {});
  assert.deepEqual(cleared.cleared, ['pass']);
});

test('SMTP: невалиден хост, порт или подател с нов ред се отказват', () => {
  const bad = parseIntegrationForm(
    'smtp',
    {
      ...smtpBody,
      host: 'smtp relay',
      port: '70000',
      from: 'Фактурист <a@b.c>\r\nBcc: x@y.z',
    },
    {},
  );
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.errors['host'] && bad.errors['port'] && bad.errors['from']);
});

test('Revolut: средата е sandbox или production; webhook тайната започва с wsk_', () => {
  const good = parseIntegrationForm(
    'revolut',
    { environment: 'sandbox', secretKey: SK, webhookSecret: WSK },
    {},
  );
  assert.ok(good.ok);
  assert.deepEqual(good.config, { environment: 'sandbox' });
  assert.deepEqual(good.secrets, { secretKey: SK, webhookSecret: WSK });
  const bad = parseIntegrationForm(
    'revolut',
    { environment: 'live', secretKey: 'sk with space', webhookSecret: 'abc' },
    {},
  );
  assert.equal(bad.ok, false);
  assert.ok(
    !bad.ok && bad.errors['environment'] && bad.errors['secretKey'] && bad.errors['webhookSecret'],
  );
});

test('тайните са шифровани и вързани с интеграцията (AAD)', () => {
  const sealed = sealSecrets('smtp', { pass: BREVO_KEY });
  assert.ok(sealed && !sealed.includes(BREVO_KEY));
  assert.deepEqual(openSecrets('smtp', sealed), { pass: BREVO_KEY });
  assert.throws(() => openSecrets('revolut', sealed));
  assert.equal(sealSecrets('smtp', {}), null);
});

test('обратно се показват само последните 4 знака, при къса тайна — нищо', () => {
  assert.equal(secretHint(BREVO_KEY), '…AbCd');
  assert.equal(secretHint('short-secret'), '••••');
});

test('всяко поле-тайна е обявено в регистъра и има превод', () => {
  assert.deepEqual(
    INTEGRATIONS.smtp.fields.filter((f) => f.secret).map((f) => f.name),
    ['pass'],
  );
  assert.deepEqual(
    INTEGRATIONS.revolut.fields.filter((f) => f.secret).map((f) => f.name),
    ['secretKey', 'webhookSecret'],
  );
  for (const integration of Object.values(INTEGRATIONS)) {
    for (const field of integration.fields) assert.ok(field.label.bg && field.label.en);
  }
});

const env = {
  SMTP_HOST: 'smtp.env.test',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: 'env-user',
  SMTP_PASS: 'env-pass',
  MAIL_FROM: 'Env <env@example.test>',
  REVOLUT_WEBHOOK_SECRET: 'wsk_from_env_secret',
};

test('панелът има предимство пред .env; без панел — .env; без двете — няма поща', () => {
  const panel = {
    config: {
      host: 'smtp-relay.brevo.com',
      port: 2525,
      secure: false,
      user: 'u',
      from: 'Фактурист <no-reply@fakturist.eu>',
    },
    secrets: { pass: BREVO_KEY },
  };
  const fromPanel = resolveSmtp(panel, env);
  assert.equal(fromPanel?.source, 'panel');
  assert.equal(fromPanel?.host, 'smtp-relay.brevo.com');
  assert.equal(fromPanel?.pass, BREVO_KEY);
  assert.equal(resolveSmtp(null, env)?.source, 'env');
  // Ред само с резултат от проверка (без настройки) не скрива .env.
  assert.equal(resolveSmtp({ config: {}, secrets: {} }, env)?.source, 'env');
  assert.equal(resolveSmtp(null, { ...env, SMTP_HOST: undefined }), null);
});

test('Revolut: webhook тайната от панела, иначе от .env', () => {
  const panel = { config: { environment: 'production' }, secrets: { webhookSecret: WSK } };
  assert.equal(resolveRevolut(panel, env).webhookSecret, WSK);
  assert.equal(resolveRevolut(panel, env).environment, 'production');
  assert.equal(resolveRevolut(null, env).webhookSecret, 'wsk_from_env_secret');
  assert.equal(resolveRevolut(null, env).environment, 'sandbox');
  assert.equal(resolveRevolut(null, { ...env, REVOLUT_WEBHOOK_SECRET: undefined }).secretKey, null);
});

test('проверката на Revolut вика GET /api/orders?limit=1 със заглавките по документацията', async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; method: string }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return new Response('[]', { status: 200 });
  };
  const ok = await checkRevolut({ environment: 'sandbox', secretKey: SK }, fakeFetch);
  assert.deepEqual(ok, { ok: true, error: null });
  assert.equal(calls[0]!.url, 'https://sandbox-merchant.revolut.com/api/orders?limit=1');
  assert.equal(calls[0]!.method, 'GET');
  assert.equal(calls[0]!.headers['authorization'], `Bearer ${SK}`);
  assert.equal(calls[0]!.headers['revolut-api-version'], REVOLUT_API_VERSION);
  await checkRevolut({ environment: 'production', secretKey: SK }, fakeFetch);
  assert.equal(calls[1]!.url, 'https://merchant.revolut.com/api/orders?limit=1');
});

test('отказан ключ и мрежова грешка — без ключа в текста', async () => {
  const unauthorized = await checkRevolut(
    { environment: 'sandbox', secretKey: SK },
    async () => new Response('{"message":"unauthorized"}', { status: 401 }),
  );
  assert.deepEqual(unauthorized, { ok: false, error: 'unauthorized' });
  const network = await checkRevolut({ environment: 'sandbox', secretKey: SK }, async () => {
    throw new Error(`fetch failed for Bearer ${SK}`);
  });
  assert.equal(network.ok, false);
  assert.ok(network.error && !network.error.includes(SK));
  const missing = await checkRevolut({ environment: 'sandbox', secretKey: null }, async () => {
    throw new Error('не трябва да се вика');
  });
  assert.deepEqual(missing, { ok: false, error: 'missingKey' });
});

test('проверката на SMTP: връзка + пробно писмо до мастъра; грешката е без адреси и ключ', async () => {
  const sent: Array<{ from: string; to: string; subject: string }> = [];
  const transport = {
    verify: async () => true,
    sendMail: async (message: { from: string; to: string; subject: string }) => {
      sent.push(message);
      return {};
    },
  };
  const ok = await checkSmtp(transport, {
    from: 'Фактурист <no-reply@fakturist.eu>',
    to: 'master@example.test',
    secrets: [BREVO_KEY],
  });
  assert.deepEqual(ok, { ok: true, error: null });
  assert.equal(sent[0]!.to, 'master@example.test');
  assert.equal(sent[0]!.from, 'Фактурист <no-reply@fakturist.eu>');
  const failing = {
    verify: async () => {
      throw new Error(`Invalid login: 535 for login@smtp-brevo.test with ${BREVO_KEY}`);
    },
    sendMail: async () => ({}),
  };
  const bad = await checkSmtp(failing, {
    from: 'a@b.c',
    to: 'master@example.test',
    secrets: [BREVO_KEY],
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.error?.includes('535'));
  assert.ok(!bad.error?.includes(BREVO_KEY) && !bad.error?.includes('@'));
  assert.equal(scrub(`ключ ${SK} и a@b.c`, [SK]), 'ключ [тайна] и [адрес]');
});

test('писмото с поканата: екранирано име, връзка, срок; без друго копие на токена', () => {
  const link = 'https://fakturist.carbonstealth.eu/pokana/TOKEN123';
  const mail = transferInviteMail({
    companyName: 'Фирма <script>',
    companyEik: '131063188',
    link,
    expires: '20.11.2026',
    signature: 'Документът е създаден с fakturist.eu — продукт на Carbon Stealth VCC.',
    domain: 'fakturist.eu',
  });
  assert.ok(mail.html.includes('Фирма &lt;script&gt;'));
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(mail.text.includes(link) && mail.html.includes(link));
  assert.ok(mail.text.includes('20.11.2026'));
  assert.equal(mail.text.split('TOKEN123').length - 1, 1);
  assert.ok(mail.subject.includes('Фирма <script>'));
});

test('SMTP сървър във вътрешната мрежа (IP, localhost, име без домейн) се отказва', () => {
  for (const host of ['127.0.0.1', '169.254.169.254', 'localhost', 'postgres', 'db.internal']) {
    const result = parseIntegrationForm('smtp', { ...smtpBody, host }, {});
    assert.ok(!result.ok && result.errors['host'] === 'invalidHost', host);
  }
});

test('нечетими записани тайни не се трият тихо: искат се наново', () => {
  const lost = parseIntegrationForm('smtp', { ...smtpBody, pass: '' }, {}, ['pass']);
  assert.ok(!lost.ok && lost.errors['pass'] === 'reenterSecret');
  const renewed = parseIntegrationForm('smtp', smtpBody, {}, ['pass']);
  assert.ok(renewed.ok && renewed.secrets['pass'] === BREVO_KEY);
  const cleared = parseIntegrationForm('smtp', { ...smtpBody, pass: '', clear_pass: 'on' }, {}, [
    'pass',
  ]);
  assert.ok(cleared.ok && cleared.cleared.includes('pass'));
});

test('SMTP без TLS от началото иска STARTTLS — без него връзката се отказва', () => {
  const base = {
    source: 'panel' as const,
    host: 'smtp-relay.brevo.com',
    user: 'u',
    pass: BREVO_KEY,
    from: 'a@b.c',
  };
  assert.equal(transportOptions({ ...base, port: 2525, secure: false }).requireTLS, true);
  assert.equal(transportOptions({ ...base, port: 465, secure: true }).requireTLS, false);
});

test('писмото от кантора назовава кантората и пълномощното, екранирано', () => {
  const mail = transferInviteMail({
    companyName: 'Пекарна Зора ЕООД',
    companyEik: '131063188',
    firmName: 'Кантора <Баланс>',
    link: 'https://fakturist.carbonstealth.eu/pokana/TOKEN456',
    expires: '20.11.2026',
    signature: 'подпис',
    domain: 'fakturist.eu',
  });
  assert.ok(mail.text.includes('счетоводната кантора Кантора <Баланс>'));
  assert.ok(mail.text.includes('собствеността и достъпът остават ваши'));
  assert.ok(mail.html.includes('Кантора &lt;Баланс&gt;') && !mail.html.includes('<Баланс>'));
});
