// bot/src/utils/discordStore.js
// Адресите на Discord магазина на ГЛАВНОТО приложение (Premium Apps).
//
// Официален формат (Developer Docs → Monetization → Managing SKUs, сверено
// 12.09.2026):
//   https://discord.com/application-directory/:appID/store
//   https://discord.com/application-directory/:appID/store/:skuID
// В чат Discord ги рендерира като карта с бутон за покупка; в браузър водят
// към Application Directory.
//
// White-label ботовете са ОТДЕЛНИ приложения и нямат свой магазин — SKU-тата
// принадлежат на главния бот, затова там винаги ползваме неговото id от env
// (DISCORD_CLIENT_ID), а не `client.application.id`.

function mainApplicationId(client) {
  if (client?.isWhiteLabel !== true && client?.application?.id) return client.application.id;
  return process.env.DISCORD_CLIENT_ID || null;
}

export function storeUrl(client) {
  const app = mainApplicationId(client);
  return app ? `https://discord.com/application-directory/${app}/store` : null;
}

export function skuUrl(client, skuId) {
  const app = mainApplicationId(client);
  return app && skuId ? `https://discord.com/application-directory/${app}/store/${skuId}` : null;
}

/**
 * Къде да пратим потребител, който трябва да плати: магазинът в Discord, а
 * при липсваща конфигурация — таблото (никога празен низ в съобщение).
 */
export function upgradeUrl(client) {
  return storeUrl(client) || process.env.FRONTEND_URL || "the dashboard";
}
