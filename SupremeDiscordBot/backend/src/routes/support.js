// backend/src/routes/support.js
// GET /support — публичното пренасочване към сървъра за поддръжка.
//
// Един постоянен адрес, към който сочат ботът (бутонът „Поддръжка“ в /help и в
// приветствието), таблото, сайтът и llms.txt. Целта се задава от главния акаунт в
// конзолата (PUT /api/admin/support-invite) и важи веднага.
//
// Маршрутът НИКОГА не връща грешка и НИКОГА не води извън Discord или нашия сайт:
// целта идва само от `getSupportInviteUrl()` (форма, проверена и при четене), а нищо
// от заявката — път, параметри, заглавия — не влиза в `Location`.
import { Router } from "express";
import { getSupportInviteUrl, SUPPORT_FALLBACK_PATH } from "../lib/supportInvite.js";

const router = Router();

router.get("/", async (_req, res) => {
  const url = await getSupportInviteUrl().catch(() => null);
  // Без кеш: смяната на поканата важи от следващото кликване, а не след час.
  res.set("Cache-Control", "no-store");
  // Пренасочване не е страница — да не влиза в индекса вместо /docs.
  res.set("X-Robots-Tag", "noindex");
  res.redirect(302, url || SUPPORT_FALLBACK_PATH);
});

export default router;
