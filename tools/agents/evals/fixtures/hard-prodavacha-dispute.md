# Проба (измислен вход — не е реален код в репото)

SaaS с планове FREE / PRO (месечен абонамент) / FOUNDER (еднократно плащане, доживотен). Prisma модел `User { plan, planSubscriptionId, planRevokedReason }`. PR добавя обработка на спорове в Stripe webhook-а (подписът и идемпотентността по `event.id` се проверяват по-горе в същия handler — не са в diff-а).

```ts
case 'charge.dispute.created': {
  const dispute = event.data.object as Stripe.Dispute;
  const user = await userByPaymentIntent(dispute.payment_intent as string);
  if (!user) break;
  if (dispute.status === 'warning_needs_response') break;   // inquiry — пари не са изтеглени
  // Спор = губи платения план и не го получава обратно автоматично
  await db.user.update({ where: { id: user.id }, data: { plan: 'FREE', planRevokedReason: 'dispute' } });
  if (user.planSubscriptionId) {
    await stripe.subscriptions.update(user.planSubscriptionId, { pause_collection: { behavior: 'void' } });
  }
  break;
}

case 'customer.subscription.created':
case 'customer.subscription.updated': {
  const sub = event.data.object as Stripe.Subscription;
  const user = await userByCustomer(sub.customer as string);
  if (!user || user.plan === 'FOUNDER') break;
  if (user.planRevokedReason === 'dispute') break;           // dispute-hold: не връщаме платен план
  const plan = sub.status === 'active' || sub.status === 'trialing' ? planFromPrice(sub) : 'FREE';
  await db.user.update({ where: { id: user.id }, data: { plan, planSubscriptionId: sub.id } });
  break;
}
```

`userByPaymentIntent` намира потребителя и по еднократното FOUNDER плащане, и по фактура на абонамента.
