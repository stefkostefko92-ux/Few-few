# Проба (измислен вход — не е реален код в репото)

`panev/server/billing.js` (Express):

```js
app.use(express.json());

app.post('/api/checkout', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price_data: { currency: 'eur', unit_amount: req.body.amount,
      recurring: { interval: 'month' }, product_data: { name: 'Premium' } }, quantity: 1 }],
    success_url: `${BASE}/premium/activate?user=${req.user.id}`,
    cancel_url: `${BASE}/pricing`,
  });
  res.json({ url: session.url });
});

app.get('/premium/activate', async (req, res) => {
  await db.user.update({ where: { id: req.query.user }, data: { premium: true } });
  res.redirect('/dashboard');
});

app.post('/api/stripe/webhook', (req, res) => {
  const event = req.body; // TODO: провери подписа
  if (event.type === 'invoice.paid') grantPremium(event.data.object.customer);
  res.sendStatus(200);
});
```
