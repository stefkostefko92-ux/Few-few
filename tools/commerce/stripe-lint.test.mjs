// stripe-lint.test.mjs — всяко правило хваща своя дефект и мълчи при правилния код (2026-09-24).
// Двата посоки са еднакво важни: правило, което гърми на всичко, се изключва от хората — 29 фалшиви
// HIGH в SupremeDiscordBot (Discord webhook-и, import редове) бяха точно това.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintSource, codeFromMarkdown, callText } from "./stripe-lint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ids = (src) => lintSource(src, "x.js").map((f) => f.id);
const STRIPE = `import Stripe from "stripe";\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\n`;

test("пробата от живата проверка: и шестте заложени дефекта (преди — 2)", () => {
  const src = codeFromMarkdown(readFileSync(join(HERE, "..", "agents", "evals", "fixtures", "probe-prodavacha.md"), "utf8"));
  const got = new Set(lintSource(src, "probe.md").map((f) => f.id));
  for (const id of ["client-amount", "grant-in-get-route", "webhook-no-verify", "json-before-webhook", "webhook-no-idempotency", "webhook-ack-without-await", "subscription-no-revoke"])
    assert.ok(got.has(id), `липсва ${id}`);
});

test("grant-in-get-route: GET, който записва Premium → HIGH; GET, който само чете → нищо", () => {
  assert.ok(ids(STRIPE + `app.get('/premium/activate', async (req, res) => {\n  await db.user.update({ where: { id: req.query.user }, data: { premium: true } });\n  res.redirect('/');\n});`).includes("grant-in-get-route"));
  assert.ok(!ids(STRIPE + `app.get('/premium/thanks', async (req, res) => {\n  const u = await db.user.findUnique({ where: { id: req.user.id } });\n  res.render('thanks', { premium: u.premium });\n});`).includes("grant-in-get-route"));
});

test("json-before-webhook: express.json преди Stripe webhook без express.raw → HIGH; webhook преди json с raw → нищо", () => {
  assert.ok(ids(STRIPE + `app.use(express.json());\napp.post('/api/stripe/webhook', (req, res) => { res.sendStatus(200); });`).includes("json-before-webhook"));
  assert.ok(!ids(STRIPE + `app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {});\napp.use(express.json());`).includes("json-before-webhook"));
});

test("webhook-no-verify: само Stripe webhook маршрут — не import редове и не Discord webhook-и", () => {
  assert.ok(ids(STRIPE + `app.post('/api/stripe/webhook', (req, res) => { const event = req.body; res.sendStatus(200); });`).includes("webhook-no-verify"));
  assert.deepEqual(ids(`import webhooksRouter from "./routes/webhooks.js";\n// payment подписки\napp.use(webhooksRouter);`), [], "import ред не е маршрут");
  assert.ok(!ids(`// discord payment webhook\nrouter.post('/discord/webhook', verifyDiscord, handler);`).includes("webhook-no-verify"), "без Stripe във файла");
  assert.ok(!ids(STRIPE + `app.post('/api/stripe/webhook', express.raw({type:'application/json'}), (req, res) => { const e = stripe.webhooks.constructEvent(req.body, sig, secret); });`).includes("webhook-no-verify"));
});

test("webhook-no-idempotency и webhook-ack-without-await: хващат голия handler, мълчат при event.id + await; коментар не брои", () => {
  const bare = STRIPE + `app.post('/api/stripe/webhook', (req, res) => {\n  const event = stripe.webhooks.constructEvent(req.body, sig, secret);\n  if (event.type === 'invoice.paid') grantPremium(event.data.object.customer);\n  res.sendStatus(200);\n});`;
  assert.ok(ids(bare).includes("webhook-no-idempotency"));
  assert.ok(ids(bare).includes("webhook-ack-without-await"));
  const good = STRIPE + `app.post('/api/stripe/webhook', async (req, res) => {\n  const event = stripe.webhooks.constructEvent(req.body, sig, secret);\n  // по-късен re-grant (коментар)\n  if (event.type === 'invoice.paid') await db.$transaction(async (tx) => { await tx.processed.create({ data: { id: event.id } }); await grantPremium(tx); });\n  res.sendStatus(200);\n});`;
  assert.ok(!ids(good).includes("webhook-no-idempotency"));
  assert.ok(!ids(good).includes("webhook-ack-without-await"), "await + коментар с grant( не е дефект");
});

test("subscription-no-revoke: абонамент без customer.subscription.deleted → MED; с него → нищо", () => {
  const base = STRIPE + `stripe.checkout.sessions.create({ mode: 'subscription' });\napp.post('/api/stripe/webhook', h);`;
  assert.ok(ids(base).includes("subscription-no-revoke"));
  assert.ok(!ids(base + `\nif (event.type === 'customer.subscription.deleted') revoke();`).includes("subscription-no-revoke"));
});

test("missing-idempotency: ключът като ВТОРИ аргумент се вижда и след шаблонен низ с ')'", () => {
  const withKey = STRIPE + "const c = await stripe.customers.create(\n  { description: `Agency ${a.id} (owner ${u.id})` },\n  { idempotencyKey: `cust-${a.id}` }\n);";
  assert.ok(!ids(withKey).includes("missing-idempotency"), "фалшивият сигнал от agency.js");
  assert.ok(ids(STRIPE + "const c = await stripe.customers.create({ email });").includes("missing-idempotency"));
  assert.equal(callText("f(a, `x)` , (b))", 1), "(a, `x)` , (b))");
});

test("json-before-raw: req.rawBody (verify callback) не е дефект", () => {
  const src = STRIPE + `app.use(express.json());\nconst e = stripe.webhooks.constructEvent(req.body, sig, secret);`;
  assert.ok(ids(src).includes("json-before-raw"));
  assert.ok(!ids(src.replace("req.body", "req.rawBody")).includes("json-before-raw"));
});

test("markdown: сканират се само js/ts блоковете, номерата на редовете съвпадат", () => {
  const md = "# заглавие\n\nпроза\n\n```js\nconst x = { unit_amount: req.body.amount }; // stripe\n```\n\n```bash\nunit_amount: req.body.amount\n```\n";
  const code = codeFromMarkdown(md);
  assert.equal(code.split("\n").length, md.split("\n").length);
  const f = lintSource(code, "a.md").filter((x) => x.id === "client-amount");
  assert.equal(f.length, 1, "bash блокът не се брои");
  assert.equal(f[0].line, 6);
});
